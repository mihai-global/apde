"use server";

import { revalidatePath } from "next/cache";
import { addDictionary, removeDictionary } from "@/lib/supabase/repositories";
import type { DictionaryType } from "@/lib/types";

export async function createDictionaryEntry(input: {
  type: DictionaryType;
  value: string;
  note?: string;
}) {
  if (!input.value.trim()) return;
  await addDictionary({ type: input.type, value: input.value.trim(), note: input.note?.trim() ?? null });
  revalidatePath("/dictionary");
}

export async function deleteDictionaryEntry(id: string) {
  await removeDictionary(id);
  revalidatePath("/dictionary");
}
