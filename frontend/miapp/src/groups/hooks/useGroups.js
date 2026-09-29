/**
 * Helpers de grupos personalizados: normalizar, upsert y crear grupo desde un mensaje.
 */
export function normalizeServerGroup(group) {
  if (!group?.id) return null;
  return {
    id: group.id,
    name: group.name || "Grupo",
    avatarUrl: group.avatarUrl || "",
    description: group.description || "",
    admin: group.owner || group.admin || "",
    members: Array.isArray(group.members) ? group.members.filter(Boolean) : [],
  };
}

export function createGroupHelpers({ usernameRef, setCustomGroups, setViewedGroup }) {
  function upsertCustomGroup(group, { replaceMembers = false } = {}) {
    const normalized = normalizeServerGroup(group);
    if (!normalized) return;
    const id = normalized.id;
    const me = usernameRef.current;
    setCustomGroups((prev) => {
      if (prev.some((g) => g.id === id)) {
        return prev.map((g) => {
          if (g.id !== id) return g;
          const nextAdmin = normalized.admin || g.admin || "";
          let members;
          if (replaceMembers) {
            members = [...normalized.members];
            if (me && !members.includes(me) && (g.members || []).includes(me)) {
              // Expulsado: se maneja en group_removed; no reinyectar.
              members = members.filter(Boolean);
            }
          } else {
            members = Array.from(
              new Set([...(g.members || []), ...normalized.members, me].filter(Boolean)),
            );
          }
          return {
            ...g,
            name: normalized.name || g.name,
            avatarUrl: normalized.avatarUrl || g.avatarUrl || "",
            description: normalized.description || g.description || "",
            admin: nextAdmin,
            members,
          };
        });
      }
      return [
        ...prev,
        {
          ...normalized,
          admin: normalized.admin || me,
          members: Array.from(
            new Set([...normalized.members, me].filter(Boolean)),
          ),
        },
      ];
    });
    setViewedGroup((prev) => {
      if (!prev || prev.id !== id) return prev;
      const nextAdmin = normalized.admin || prev.admin || "";
      const members = replaceMembers
        ? [...normalized.members]
        : Array.from(
            new Set([...(prev.members || []), ...normalized.members].filter(Boolean)),
          );
      return {
        ...prev,
        name: normalized.name || prev.name,
        avatarUrl: normalized.avatarUrl || prev.avatarUrl || "",
        description: normalized.description || prev.description || "",
        admin: nextAdmin,
        members,
      };
    });
  }

  function ensureCustomGroupFromMessage(message) {
    if (!message.groupId) return;
    if (
      message.type !== "group_message" &&
      message.type !== "group_notice" &&
      !(message.type === "file" && message.groupId)
    ) {
      return;
    }
    upsertCustomGroup({
      id: message.groupId,
      name: message.groupName || "Grupo",
      members: message.members || [],
    });
  }

  return { upsertCustomGroup, ensureCustomGroupFromMessage };
}
