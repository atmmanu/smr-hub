export type SyncSummary = { first_sync: boolean; tasks: number; resources: number; updates: number; notifications: number; total: number };
export type AcademicFeed = {
 last_synced_at: string | null; summary: SyncSummary | null;
 events: { id: string; subject: string; title: string; description: string; event_type: string; external_url: string; due_date: string | null; open_date: string | null; read: boolean; completed: boolean; hidden: boolean; favourite: boolean; personal_notes: string }[];
 notifications: { id: string; type: string; title: string; message: string; read: boolean; created_at: string }[];
};
