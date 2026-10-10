import { LearningScreen } from "@/components/learning-screen";
export default async function Learn({ params }: { params: Promise<{ id: string }> }) {
  return <LearningScreen id={(await params).id} />;
}
