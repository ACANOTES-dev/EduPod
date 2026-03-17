export interface PreviewFact {
  label: string;
  value: string;
}

export interface PreviewResponse {
  id: string;
  entity_type: string;
  primary_label: string;
  secondary_label: string;
  status: string;
  facts: PreviewFact[];
}
