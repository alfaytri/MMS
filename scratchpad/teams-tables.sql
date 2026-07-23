=== employees ===
CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_ar text,
    phone text NOT NULL,
    skills text[] DEFAULT '{}'::text[],
    status public.employee_status DEFAULT 'active'::public.employee_status,
    team_id uuid,
    avatar text,
    join_date date NOT NULL,
    nationality text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    site_visit_order boolean DEFAULT false NOT NULL,
    site_visit_quotation boolean DEFAULT false NOT NULL,
    avatar_url text,
    deleted_at timestamp with time zone,
    division_id uuid,
    profile_id uuid
);

=== teams ===
CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    tag public.team_tag DEFAULT 'normal'::public.team_tag,
    vehicle_id uuid,
    schedule_id uuid,
    schedule_start integer DEFAULT 7,
    schedule_end integer DEFAULT 17,
    leader_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_emergency boolean DEFAULT false NOT NULL,
    is_qc boolean DEFAULT false NOT NULL,
    traccar_device_id text,
    deleted_at timestamp with time zone,
    name_en text DEFAULT ''::text NOT NULL,
    name_ar text,
    phone text,
    site_visit_order boolean DEFAULT false NOT NULL,
    site_visit_quotation boolean DEFAULT false NOT NULL,
    division_id uuid,
    is_normal boolean DEFAULT false NOT NULL,
    CONSTRAINT check_qc_exclusive CHECK ((NOT (is_qc AND (is_normal OR is_emergency))))
);

=== schedules ===
CREATE TABLE public.schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    days jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);

=== team_activity_log ===
CREATE TABLE public.team_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    before_data jsonb,
    after_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

=== team_schedule_assignments ===
CREATE TABLE public.team_schedule_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    schedule_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date,
    created_at timestamp with time zone DEFAULT now()
);

=== tool_assignments ===
CREATE TABLE public.tool_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tool_unit_id uuid NOT NULL,
    assigned_to text NOT NULL,
    team_id uuid,
    employee_id uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT one_target CHECK ((((team_id IS NOT NULL) AND (employee_id IS NULL)) OR ((employee_id IS NOT NULL) AND (team_id IS NULL)))),
    CONSTRAINT tool_assignments_assigned_to_check CHECK ((assigned_to = ANY (ARRAY['team'::text, 'employee'::text])))
);

=== vehicles ===
CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    plate text NOT NULL,
    team_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    traccar_device_id text,
    deleted_at timestamp with time zone,
    name text
);

