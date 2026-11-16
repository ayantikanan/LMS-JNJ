export type Filters = Record<string, string[]>;

export interface User {
  id: string;
  name: string;
  title: string;
  role: string;
  scope_level: 'Local' | 'Regional' | 'Global';
  regions: string[];
  clusters: string[];
  countries: string[];
  tas: string[];
  products: string[];
  can_edit: string;
  is_admin: boolean;
  default_filters?: Filters;
  access_rule?: string;
  edit_rule?: string;
}

export interface Quality {
  score: number;
  band: 'High' | 'Medium' | 'Low';
  tips: string[];
}

export interface RecordDoc {
  id: number;
  title: string;
  year: string;
  quarter: string;
  region: string;
  cluster: string;
  country: string;
  activity_type: string;
  content: string[];
  specific_icsr: string;
  stakeholder_request: string;
  stakeholders: string[];
  products: string[];
  comments: string;
  feedback: string;
  material_external: string;
  product_launch: string;
  materials: string[];
  stakeholder_status: string;
  follow_up: string;
  impact_category: string;
  outcomes: string[];
  tas?: string[];
  activity_level?: string;
  topics?: string[];
  quality?: Quality;
  created?: string;
  created_by?: string;
  modified?: string;
  modified_by?: string;
  created_date?: string;
  can_edit?: boolean;
  demo_values?: boolean;
}

export interface Material {
  id: string;
  title: string;
  products: string[];
  ta: string[];
  content_type: string;
  date_added: string;
  external_use: boolean;
  source: string;
  link: string;
  is_new?: boolean;
  relevant?: boolean;
  times_used?: number;
}

export interface StakeholderOption {
  code: string;
  name: string;
  type: 'Internal' | 'External';
}

export interface Reference {
  dropdowns: {
    title: string[];
    year: string[];
    quarter: string[];
    activity_type: string[];
    content: string[];
    yes_no: string[];
    stakeholder_request: string[];
    products: string[];
    tas: string[];
    stakeholders: StakeholderOption[];
    activity_level: string[];
    hierarchy: Record<string, Record<string, string[]>>;
    kpi: { stakeholder_status: string[]; follow_up: string[]; impact_category: string[]; outcomes: string[] };
    topics: string[];
  };
  help_text: Record<string, string>;
  materials: Material[];
  workflow: {
    stages: { id: string; label: string; sla_days: number }[];
    escalation_contacts: Record<string, { name: string; role: string }[]>;
  };
  reference_date: string;
  data_refreshed: string;
  product_ta: Record<string, string>;
  demo_note: string;
}

export interface NameCount {
  name: string;
  count: number;
  pct?: number;
}

export interface Dashboard {
  tiles: {
    total: number;
    discussion: number;
    presentation: number;
    material: number;
    training: number | null;
    internal_pct: number;
    external_pct: number;
    avg_quality: number;
    follow_up_pct: number;
    new_stakeholder_pct: number;
    stakeholder_requests: number;
  };
  evolution: {
    periods: string[];
    counts: number[];
    years: string[];
    by_year: number[];
    by_period_activity: Record<string, number[]>;
  };
  activity_type: NameCount[];
  content: { categories: string[]; series: Record<string, number[]>; pct: Record<string, number[]>; total_pct: number[] };
  products: { categories: string[]; series: Record<string, number[]> };
  stakeholders: { code: string; name: string; type: string; count: number; pct: number }[];
  additional: Record<'product_launch' | 'material_external' | 'stakeholder_request', { value: string; count: number; pct: number }[]>;
  geo: { level: 'region' | 'cluster' | 'country'; items: NameCount[]; periods: string[]; series: Record<string, number[]> };
  ta: NameCount[];
  activity_level: NameCount[];
  impact: NameCount[];
  quality_bands: NameCount[];
  outcomes: NameCount[];
}

export interface Notification {
  id: string;
  kind: 'stakeholder_gap' | 'new_material' | 'workflow' | 'quality';
  severity: 'high' | 'medium' | 'info';
  title: string;
  body: string;
  action: { label: string; href: string };
  dismissed: boolean;
}

export interface BRRequest {
  id: string;
  record_id: number | null;
  title: string;
  product: string;
  ta: string;
  country: string;
  stakeholders: string[];
  assignee: { name: string; role: string };
  stage: string;
  events: { stage: string; at: string; by: string; note: string }[];
}

export interface SavedView {
  id: number;
  name: string;
  page: string;
  filters: Filters;
}

export interface Report {
  id: string;
  name: string;
  owner: string;
  audience: string;
  filters: Filters;
  sections: string[];
}

export interface ChatAnswer {
  answer: string;
  engine: 'gemini' | 'ollama' | 'rules';
  filters_used: Filters;
  filters_text: string;
  sources: number[];
}
