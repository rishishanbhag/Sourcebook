// Row shapes mirror the CSV headers in data/. All values are strings as parsed.
export type Row = Record<string, string>;

export interface Claim {
  claim_id: string;
  subject_type: string;
  subject_id: string;
  field: string;
  value: string;
  unit: string;
  period: string;
  source_id: string;
  source_date: string; // filled from the source's published_date when blank
  retrieved_date: string;
  method: string;
  quote: string;
  page_ref: string;
  flag: string;
}

export type Level = 'High' | 'Medium' | 'Low';

export interface FactGroup {
  field: string;
  unit: string;
  period: string;
  status: 'single' | 'agree' | 'disputed';
  confidence: number;
  level: Level;
  preferred: Claim;
  claims: Claim[]; // preferred first
}

export interface Site extends Row {
  confidence: string; // Level
}

export interface Db {
  generated_at: string;
  sources: Record<string, Row>;
  parents: Row[];
  entities: Row[];
  sites: Site[];
  cities: Row[];
  policies: Row[];
  providers: Row[];
  engagements: Row[];
  facts: Record<string, Record<string, FactGroup[]>>; // key `${subject_type}:${subject_id}`
  coverage: { sites: number; reference: FactGroup | null };
}
