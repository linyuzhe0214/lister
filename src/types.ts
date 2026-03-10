export interface Report {
  id?: number;
  item_number: string;
  log_time: string;
  highway: string;
  direction: string;
  mileage: string;
  lane: string;
  damage_condition: string;
  improvement_method: string;
  supervision_review: string;
  follow_up_method: string;
  completion_time: string;
  location_type: 'mainline' | 'ramp';
  photo: string;
  created_at?: string;
}
