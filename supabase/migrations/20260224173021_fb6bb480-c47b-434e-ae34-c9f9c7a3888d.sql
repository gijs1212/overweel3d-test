
-- Table to store OneDrive OAuth tokens (admin-only, service_role access)
CREATE TABLE public.onedrive_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS but only allow service_role
ALTER TABLE public.onedrive_tokens ENABLE ROW LEVEL SECURITY;

-- No public policies - only service_role can access this table
