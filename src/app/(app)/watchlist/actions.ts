"use server";

import { revalidatePath } from "next/cache";
import { removeWatchlist, upsertWatchlist } from "@/lib/supabase/repositories";
import type { WatchlistStatus } from "@/lib/types";

export async function updateWatchlistStatus(asin: string, status: WatchlistStatus) {
  await upsertWatchlist({ asin, status });
  revalidatePath("/watchlist");
  revalidatePath("/");
}

export async function deleteWatchlist(asin: string) {
  await removeWatchlist(asin);
  revalidatePath("/watchlist");
  revalidatePath("/");
}
