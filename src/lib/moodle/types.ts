export type MoodleCourse = { course_id: number; fullname: string; shortname: string; subject: string | null; manual: boolean };
export type MoodleStatus = { configured: boolean; connected: boolean; site_url: string | null; connected_at: string | null; checked_at: string | null; courses: MoodleCourse[] };

export class MoodleError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message); this.name = "MoodleError"; this.code = code; this.status = status;
  }
}
