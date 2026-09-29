let unlocked = false;
let sharedAudio = null;
let beepUrl = null;

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i += 1) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Tri-tono estilo iPhone clásico (SMS / Text Tone):
 * tres notas cortas ascendentes, tipo marimba.
 */
function buildBeepDataUrl() {
  const sampleRate = 22050;
  const notes = [
    { freq: 587.33, start: 0.0, dur: 0.14 }, // D5
    { freq: 880.0, start: 0.13, dur: 0.14 }, // A5
    { freq: 1174.66, start: 0.26, dur: 0.22 }, // D6
  ];
  const totalDur = 0.52;
  const numSamples = Math.floor(sampleRate * totalDur);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    let sample = 0;
    for (const note of notes) {
      const local = t - note.start;
      if (local < 0 || local > note.dur) continue;
      // Ataque rápido + decay tipo marimba/pluck.
      const env =
        Math.min(1, local * 80) * Math.exp(-local * 14) * (1 - local / note.dur);
      const fundamental = Math.sin(2 * Math.PI * note.freq * local);
      const harmonic = 0.35 * Math.sin(2 * Math.PI * note.freq * 2 * local);
      const overtone = 0.12 * Math.sin(2 * Math.PI * note.freq * 3 * local);
      sample += (fundamental + harmonic + overtone) * env;
    }
    sample = Math.max(-1, Math.min(1, sample * 0.85));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function getBeepUrl() {
  if (!beepUrl) beepUrl = buildBeepDataUrl();
  return beepUrl;
}

function getAudio() {
  if (typeof window === "undefined") return null;
  if (!sharedAudio) {
    sharedAudio = new Audio(getBeepUrl());
    sharedAudio.preload = "auto";
    sharedAudio.volume = 1;
  }
  return sharedAudio;
}

/** iOS/Safari: hay que “despertar” el audio con un gesto del usuario. */
export function unlockNotificationAudio() {
  try {
    const audio = getAudio();
    if (!audio) return;
    audio.muted = true;
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise?.then) {
      playPromise
        .then(() => {
          audio.pause();
          audio.muted = false;
          audio.currentTime = 0;
          unlocked = true;
        })
        .catch(() => {});
    } else {
      audio.pause();
      audio.muted = false;
      unlocked = true;
    }
  } catch {
    /* ignore */
  }
}

/** Sonido al llegar una notificación / toast. */
export function playNotificationSound() {
  try {
    const audio = getAudio();
    if (!audio) return;

    const play = () => {
      audio.muted = false;
      audio.volume = 1;
      audio.currentTime = 0;
      audio
        .play()
        .then(() => {
          unlocked = true;
        })
        .catch(() => {
          unlocked = false;
        });
    };

    play();

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([30, 40, 30]);
    }
  } catch {
    /* ignore */
  }
}

export function isNotificationAudioUnlocked() {
  return unlocked;
}
