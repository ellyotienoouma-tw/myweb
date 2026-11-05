import { createClient } from "@/lib/supabase/server";

export async function getAdminUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Could not verify the current user.", error);
    return { user: null, error };
  }
  if (!user || user.app_metadata.role !== "admin") {
    return { user: null, error: null };
  }
  return { user, error: null };
}
