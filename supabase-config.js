// Supabase Configuration
const SUPABASE_URL = 'https://prrqbxkonkgddxtwhgsc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycnFieGtvbmtnZGR4dHdoZ3NjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4ODgxNzgsImV4cCI6MjA4MzQ2NDE3OH0.QnHdO-CMC7B9-nz_E5BfkV3BmJ0GEBNpHJWF-LeFOME';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
