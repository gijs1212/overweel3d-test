import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://askbgpdygdiwuocsmsfn.supabase.co"
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_CUNLvx4UONiUiIiLzEgnmA__eIEpc_0"

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
)