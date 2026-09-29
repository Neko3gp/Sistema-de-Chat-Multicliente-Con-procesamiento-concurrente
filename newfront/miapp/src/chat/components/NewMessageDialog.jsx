/**
 * Diálogo para iniciar un chat privado eligiendo un usuario del directorio.
 */
import ComposeDialog from "./ComposeDialog";
import UserPickerList from "../../groups/components/UserPickerList";

export default function NewMessageDialog({
  onClose,
  onSelectUser,
  directoryUsers = [],
  onlineUsers = [],
  loading = false,
}) {
  return (
    <ComposeDialog
      title="Nuevo mensaje"
      onClose={onClose}
      footer={
        <button type="button" className="ghost" onClick={onClose}>
          Cancelar
        </button>
      }
    >
      <p>Elige un usuario de la base de datos para iniciar el chat.</p>
      <UserPickerList
        users={directoryUsers}
        onlineUsers={onlineUsers}
        loading={loading}
        mode="single"
        onSelect={(name) => {
          onSelectUser?.(name);
          onClose?.();
        }}
      />
    </ComposeDialog>
  );
}
