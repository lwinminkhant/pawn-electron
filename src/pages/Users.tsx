import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Banner,
  Button,
  Card,
  CardBody,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "../components/ui";

interface User {
  id: number;
  name: string;
  userName: string;
  level: "Admin" | "Staff";
  password?: string;
}

const Users: React.FC = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [name, setName] = useState("");
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [level, setLevel] = useState<"Admin" | "Staff">("Staff");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke("get-users", {});
      if (result.success) setUsers(result.users);
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setName(user.name);
      setUserName(user.userName);
      setLevel(user.level);
      setPassword("");
    } else {
      setEditingUser(null);
      setName("");
      setUserName("");
      setPassword("");
      setLevel("Staff");
    }
    setMessage(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      if (editingUser) {
        const result = await window.electron.ipcRenderer.invoke("update-user", {
          id: editingUser.id,
          name,
          userName,
          password: password || undefined,
          level,
        });
        if (result.success) {
          setMessage({ type: "success", text: t('pages.users.userUpdatedSuccessfully') });
          loadUsers();
          setTimeout(handleCloseModal, 1200);
        } else {
          setMessage({ type: "error", text: result.message });
        }
      } else {
        if (!password) {
          setMessage({
            type: "error",
            text: t('pages.users.passwordRequiredForNew'),
          });
          setLoading(false);
          return;
        }
        const result = await window.electron.ipcRenderer.invoke("create-user", {
          name,
          userName,
          password,
          level,
        });
        if (result.success) {
          setMessage({ type: "success", text: t('pages.users.userCreatedSuccessfully') });
          loadUsers();
          setTimeout(handleCloseModal, 1200);
        } else {
          setMessage({ type: "error", text: result.message });
        }
      }
    } catch (error: any) {
      console.error("Operation failed:", error);
      setMessage({
        type: "error",
        text: `လုပ်ဆောင်မှု မအောင်မြင်ပါ: ${error.message || "မသိသော အမှား"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('pages.users.confirmDelete'))) return;
    try {
      const result = await window.electron.ipcRenderer.invoke("delete-user", {
        id,
      });
      if (result.success) loadUsers();
      else alert(result.message);
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button
          type="button"
          variant="primary"
          leadingIcon={<Plus size={14} />}
          onClick={() => handleOpenModal()}
        >
          {t('pages.users.addUser')}
        </Button>
      </div>

      <Card>
        <CardBody className="p-0">
          {users.length === 0 ? (
            <EmptyState
              title={t('pages.users.noUsers')}
              description={t('pages.users.createFirstUser')}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('pages.users.name')}</TH>
                  <TH>{t('pages.users.username')}</TH>
                  <TH>{t('pages.users.role')}</TH>
                  <TH align="right">{t('pages.users.actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {users.map((user) => (
                  <TR key={user.id}>
                    <TD>
                      <span className="font-medium">{user.name}</span>
                    </TD>
                    <TD mono muted>
                      {user.userName}
                    </TD>
                    <TD>
                      <Badge
                        tone={user.level === "Admin" ? "brass" : "success"}
                        size="sm"
                      >
                        {user.level === "Admin"
                          ? t('pages.users.adminRole')
                          : t('pages.users.staff')}
                      </Badge>
                    </TD>
                    <TD align="right">
                      <div className="inline-flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          leadingIcon={<Pencil size={12} />}
                          onClick={() => handleOpenModal(user)}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          leadingIcon={<Trash2 size={12} />}
                          onClick={() => handleDelete(user.id)}
                        >
                          {t('common.delete')}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={isModalOpen}
        onClose={handleCloseModal}
        title={editingUser ? t('pages.users.editUser') : t('pages.users.addNewUser')}
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={handleCloseModal}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form="user-form"
              variant="primary"
              loading={loading}
            >
              {loading ? t('pages.users.saving') : t('pages.users.saveUser')}
            </Button>
          </>
        }
      >
        {message && (
          <div className="mb-4">
            <Banner tone={message.type === "success" ? "success" : "danger"}>
              {message.text}
            </Banner>
          </div>
        )}
        <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
          <Field label={t('pages.users.fullName')}>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label={t('pages.users.usernameField')}>
            <Input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
            />
          </Field>
          <Field
            label={t('pages.users.password')}
            hint={
              editingUser ? t('pages.users.leaveBlankToKeep') : undefined
            }
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('pages.users.passwordPlaceholder')}
            />
          </Field>
          <Field label={t('pages.users.roleField')}>
            <Select
              value={level}
              onChange={(e) => setLevel(e.target.value as "Admin" | "Staff")}
            >
              <option value="Staff">{t('pages.users.staff')}</option>
              <option value="Admin">{t('pages.users.adminRole')}</option>
            </Select>
          </Field>
        </form>
      </Dialog>
    </div>
  );
};

export default Users;
