// Supabase Configuration
// Replace these with your actual Supabase project credentials
// Found in: Supabase Dashboard → Settings → API

const SUPABASE_URL = 'YOUR_SUPABASE_URL';  // e.g., https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';  // Public anon key

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
