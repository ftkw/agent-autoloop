import type { Rule } from "../kernel/rules.ts";
export type Job = {
  run: number;
  token: string;
  attempt: number;
  rule: Pick<Rule, "name" | "cwd" | "skill" | "prompt" | "title" | "emits">;
  agent: {
    id: string;
    name: string;
    use: string;
    model?: string;
    effort?: string;
    tier?: string;
    access: string;
    command?: string[];
    program?: string;
    timeout?: number;
  };
  session: string | null;
  askFirst: string[];
  context: {
    events: {
      id: string;
      source: string;
      sourceName: string;
      type: string;
      subject: string;
      summary: string;
      detail: string;
      link: string;
      receivedAt: string;
      hops?: number;
    }[];
    answers: {
      card: number;
      title: string;
      options: string[];
      choice: number | null;
      chosen: string | null;
      text: string | null;
      about: string;
      by: string | null;
      at: string;
    }[];
    timers: { key: string; about: string; at: string }[];
    waiting: { key: string; about: string; at: string }[];
    open: { card: number; title: string; text: string; at: string }[];
    decided: { card: number; title: string; choice: string | null; at: string }[];
    /** Why this round may be done: the version it was granted under, what it may work with, and who set it off. A record
     * for the agent to read and for a later round to compare against, never a permission it can widen by reading it. */
    mandate: {
      rulesVersion: number;
      policy: { access: string; agent: string };
      by: { source: string; rule: string; lane: string };
    };
  };
};
