export type NotificationItem = { id: string; type: string; title: string; message: string; read: boolean; created_at: string; subject: string | null; event_id: string | null; href: string | null };
export type NotificationData = { items: NotificationItem[]; unread_count: number };
export const notificationIcons: Record<string, string> = { reminder: "🔔", new_assignment: "📝", new_resource: "📄", assignment_updated: "✏️", due_date_changed: "🕒", new_content: "📚" };
