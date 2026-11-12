/** A card on a generic kanban board (backed by the `pipeline_items` table). */
export type PipelineItem = {
  id: string;
  title: string;
  stage: string;
  subtitle?: string;
  assignee?: string;
  phone?: string;
  email?: string;
};
