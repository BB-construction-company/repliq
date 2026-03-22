export interface Message {
  sender: string;
  text: string;
}

export interface UserPreferences {
  receiving: string[];
  sending: string[];
  ambiguous: string[];
}

export interface PossibleMeaning {
  text: string;
  likelihood: "high" | "medium" | "low";
}

export interface AnalyzeRequest {
  current_message: Message;
  history: Message[];
  user_preferences: UserPreferences;
  mode: "decode" | "compose";
}

export interface AnalyzeResponse {
  tone_summary: string;
  tone_flag: "neutral" | "caution" | "unclear";
  explanation: string;
  possible_meanings: PossibleMeaning[];
  suggested_reply: string | null;
  compose_rewrite: string | null;
  flag_reason: string | null;
}
