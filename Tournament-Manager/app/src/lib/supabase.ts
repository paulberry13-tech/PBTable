import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from './config'

// One shared client for the whole app.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
