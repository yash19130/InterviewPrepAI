import { KitSchema, type Flashcard, type Kit, type Question, type ScheduleDay } from "@/lib/schemas";

export type EditableSection = "questions" | "flashcards" | "schedule";

export type KitEditMetadata = {
  pinnedQuestionIds: string[];
  pinnedFlashcardIds: string[];
  pinnedScheduleDays: number[];
  editedFields: Record<string, true>;
  skippedGeneratedIds: string[];
  flashcardConfidence?: Record<string, "low" | "medium" | "high">;
};

export type StoredKitDocument = {
  userId: string;
  originalKit: Kit;
  currentKit: Kit;
  metadata: KitEditMetadata;
  createdAt: string;
  updatedAt: string;
};

export const emptyEditMetadata: KitEditMetadata = {
  pinnedQuestionIds: [],
  pinnedFlashcardIds: [],
  pinnedScheduleDays: [],
  editedFields: {},
  skippedGeneratedIds: [],
  flashcardConfidence: {},
};

export function createStoredKitDocument({
  userId,
  kit,
  now,
}: {
  userId: string;
  kit: Kit;
  now: Date;
}): StoredKitDocument {
  const timestamp = now.toISOString();

  return {
    userId,
    originalKit: kit,
    currentKit: kit,
    metadata: emptyEditMetadata,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function mergeRegeneratedKit({
  currentKit,
  regeneratedKit,
  metadata,
}: {
  currentKit: Kit;
  regeneratedKit: Kit;
  metadata: KitEditMetadata;
}): { kit: Kit; metadata: KitEditMetadata } {
  const pinnedQuestionIds = new Set(metadata.pinnedQuestionIds);
  const pinnedFlashcardIds = new Set(metadata.pinnedFlashcardIds);
  const pinnedScheduleDays = new Set(metadata.pinnedScheduleDays);
  const skippedGeneratedIds = new Set(metadata.skippedGeneratedIds);

  const questions = mergeItems({
    currentItems: currentKit.questions,
    regeneratedItems: regeneratedKit.questions,
    isPinned: (item) => pinnedQuestionIds.has(item.id) || hasEditedField(metadata, `questions.${item.id}`),
    markSkipped: (item) => skippedGeneratedIds.add(item.id),
  });
  const flashcards = mergeItems({
    currentItems: currentKit.flashcards,
    regeneratedItems: regeneratedKit.flashcards,
    isPinned: (item) => pinnedFlashcardIds.has(item.id) || hasEditedField(metadata, `flashcards.${item.id}`),
    markSkipped: (item) => skippedGeneratedIds.add(item.id),
  });
  const daysByNumber = new Map(currentKit.schedule.days.map((day) => [day.day, day]));
  const scheduleDays = regeneratedKit.schedule.days.map((day) => {
    const currentDay = daysByNumber.get(day.day);

    if (currentDay && pinnedScheduleDays.has(day.day)) {
      skippedGeneratedIds.add(`schedule.day.${day.day}`);
      return currentDay;
    }

    return day;
  });

  const kit = KitSchema.parse({
    ...regeneratedKit,
    questions,
    flashcards,
    schedule: {
      ...regeneratedKit.schedule,
      days: scheduleDays,
    },
  });

  return {
    kit,
    metadata: {
      ...metadata,
      skippedGeneratedIds: Array.from(skippedGeneratedIds).sort(),
    },
  };
}

function mergeItems<T extends Question | Flashcard>({
  currentItems,
  regeneratedItems,
  isPinned,
  markSkipped,
}: {
  currentItems: T[];
  regeneratedItems: T[];
  isPinned: (item: T) => boolean;
  markSkipped: (item: T) => void;
}): T[] {
  const currentById = new Map(currentItems.map((item) => [item.id, item]));

  return regeneratedItems.map((generatedItem) => {
    const currentItem = currentById.get(generatedItem.id);

    if (currentItem && isPinned(currentItem)) {
      markSkipped(generatedItem);
      return currentItem;
    }

    return generatedItem;
  });
}

function hasEditedField(metadata: KitEditMetadata, prefix: string): boolean {
  return Object.keys(metadata.editedFields).some((field) => field.startsWith(prefix));
}

export function markQuestionEdited(
  metadata: KitEditMetadata,
  questionId: string,
  field: keyof Pick<Question, "prompt" | "answer_outline" | "category" | "difficulty">,
): KitEditMetadata {
  return {
    ...metadata,
    editedFields: {
      ...metadata.editedFields,
      [`questions.${questionId}.${field}`]: true,
    },
  };
}

export function markFlashcardEdited(
  metadata: KitEditMetadata,
  flashcardId: string,
  field: keyof Pick<Flashcard, "front" | "back">,
): KitEditMetadata {
  return {
    ...metadata,
    editedFields: {
      ...metadata.editedFields,
      [`flashcards.${flashcardId}.${field}`]: true,
    },
  };
}

export function markScheduleEdited(
  metadata: KitEditMetadata,
  day: ScheduleDay["day"],
): KitEditMetadata {
  return {
    ...metadata,
    pinnedScheduleDays: Array.from(new Set([...metadata.pinnedScheduleDays, day])).sort(
      (left, right) => left - right,
    ),
  };
}
