export interface SearchResult {
  entity_type: string;
  id: string;
  primary_label: string;
  secondary_label: string;
  status: string;
  highlight: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}
