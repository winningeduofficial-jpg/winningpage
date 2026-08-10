-- ============================================================
-- 00_base_schema.sql
-- Supabase Management API 추출을 통해 조립한 운영(production) 스키마 스냅샷
-- 기준 프로젝트 ref: ucjlcvqvinspmrasvsug
-- 추출 일자: 2026-07-27
-- public 스키마 테이블 수: 55
--
-- 이 파일은 dev 환경에 운영과 동일한 베이스 스키마를 재현하기 위한 것으로,
-- 이후 실행되는 sql/10_pricing_orders.sql, sql/20_landing_renewal.sql과
-- 중복되는 객체가 있어도 무방하다 (두 파일 모두 idempotent 하게 작성됨).
-- ============================================================

-- ------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------
-- pg_stat_statements / supabase_vault / plpgsql은 Supabase가 모든 프로젝트에
-- 기본 프로비저닝하므로 여기서는 생성하지 않음.
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "vector" with schema extensions;

-- ------------------------------------------------------------
-- 2. TYPES (ENUM)
-- ------------------------------------------------------------
-- (운영 DB에 public 스키마 enum 타입 없음)

-- ------------------------------------------------------------
-- 2b. SEQUENCES (테이블 생성 전 필요 - nextval 기본값 컬럼용)
-- ------------------------------------------------------------
create sequence if not exists public."admission_jungsi_results_id_seq" start with 1 increment by 1 minvalue 1 maxvalue 9223372036854775807 cache 1 no cycle;
create sequence if not exists public."admission_susi_results_id_seq" start with 1 increment by 1 minvalue 1 maxvalue 9223372036854775807 cache 1 no cycle;

-- ------------------------------------------------------------
-- 3. TABLES
-- ------------------------------------------------------------
create table if not exists public."admin_banners" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text,
    url text,
    open_new_window boolean DEFAULT false,
    pc_image_url text,
    mobile_image_url text,
    start_date date,
    end_date date,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_banners_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_cancel_reasons" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_cancel_reasons_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_classes" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    term_id uuid,
    program_id uuid,
    category_name text,
    program_name text,
    term_name text,
    class_name text NOT NULL,
    weekday text,
    start_time text,
    end_time text,
    price integer DEFAULT 0,
    capacity integer DEFAULT 1,
    target text,
    description text,
    material text,
    textbook text,
    classroom text,
    teacher text,
    thumbnail_url text,
    start_date date,
    end_date date,
    apply_start_at text,
    apply_end_at text,
    payment_start_at text,
    payment_end_at text,
    status text DEFAULT '모집 전'::text,
    registered_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_classes_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_discount_reasons" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reason text NOT NULL,
    target text DEFAULT '본인에게만 적용'::text,
    service_id text,
    discount_rate integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_discount_reasons_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_enrollments" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid,
    class_id uuid,
    term_name text,
    category_name text,
    program_name text,
    class_name text,
    capacity integer DEFAULT 0,
    guardian_name text,
    applicant_name text,
    phone text,
    grade text,
    school_name text,
    region text,
    discount_rate integer DEFAULT 0,
    discount_amount integer DEFAULT 0,
    price integer DEFAULT 0,
    paid_amount integer DEFAULT 0,
    unpaid_amount integer DEFAULT 0,
    application_status text DEFAULT '추첨대기'::text,
    payment_status text DEFAULT '납부대기'::text,
    application_route text,
    memo text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_enrollments_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_faqs" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_faqs_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_galleries" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text,
    image_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_galleries_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_notices" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notice_type text DEFAULT '공지'::text,
    title text NOT NULL,
    content text,
    file_url text,
    is_pinned boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_notices_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_payments" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    enrollment_id uuid,
    transaction_no text,
    payer_name text,
    category_name text,
    program_name text,
    class_name text,
    payment_route text DEFAULT '온라인'::text,
    payment_method text,
    sale_amount integer DEFAULT 0,
    discount_amount integer DEFAULT 0,
    paid_amount integer DEFAULT 0,
    status text DEFAULT '납부'::text,
    paid_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_payments_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_popups" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text,
    url text,
    open_new_window boolean DEFAULT false,
    pc_image_url text,
    mobile_image_url text,
    start_date date,
    end_date date,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_popups_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_program_categories" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_program_categories_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_programs" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    category_name text,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_programs_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_refunds" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    transaction_no text,
    payer_name text,
    category_name text,
    program_name text,
    class_name text,
    paid_amount integer DEFAULT 0,
    refund_amount integer DEFAULT 0,
    reason text,
    status text DEFAULT '취소요청'::text,
    requested_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_refunds_pkey PRIMARY KEY (id)
);

create table if not exists public."admin_terms" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    year integer NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint admin_terms_pkey PRIMARY KEY (id)
);

create table if not exists public."admission_jungsi_results" (
    id bigint DEFAULT nextval('admission_jungsi_results_id_seq'::regclass) NOT NULL,
    track text,
    university_name text NOT NULL,
    department_name text NOT NULL,
    apply_group text,
    quota integer,
    region_city text,
    region_district text,
    university_short_name text,
    department_short_name text,
    proper_score numeric,
    expected_score numeric,
    reach_score numeric,
    proper_percentile numeric,
    expected_percentile numeric,
    reach_percentile numeric,
    past_accept_2411 numeric,
    past_accept_2311 numeric,
    past_accept_2211 numeric,
    past_accept_2111 numeric,
    past_accept_2011 numeric,
    past_accept_1911 numeric,
    past_70_2411 numeric,
    past_70_2311 numeric,
    past_70_2211 numeric,
    past_70_2111 numeric,
    past_70_2011 numeric,
    past_70_1911 numeric,
    university_key text,
    department_key text,
    source_sheet text,
    created_at timestamp with time zone DEFAULT now(),
    constraint admission_jungsi_results_pkey PRIMARY KEY (id)
);

create table if not exists public."admission_posts" (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    content text,
    image_url text,
    file_url text,
    file_name text,
    is_pinned boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    image_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    show_on_home boolean DEFAULT false NOT NULL,
    constraint admission_posts_pkey PRIMARY KEY (id),
    constraint admission_posts_category_check CHECK ((category = ANY (ARRAY['susi'::text, 'jungsi'::text, 'essay'::text])))
);

create table if not exists public."admission_susi_results" (
    id bigint DEFAULT nextval('admission_susi_results_id_seq'::regclass) NOT NULL,
    year integer NOT NULL,
    university_name text NOT NULL,
    department_name text NOT NULL,
    main_track text,
    admission_type text,
    quota integer,
    competition_rate numeric,
    waitlist_rank text,
    converted_50 numeric,
    converted_70 numeric,
    converted_total numeric,
    grade_50 numeric,
    grade_70 numeric,
    grade_85 numeric,
    grade_90 numeric,
    subject_reflection text,
    university_key text,
    department_key text,
    source_sheet text,
    created_at timestamp with time zone DEFAULT now(),
    constraint admission_susi_results_pkey PRIMARY KEY (id)
);

create table if not exists public."admission_university_resources" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admission_year integer DEFAULT 2027 NOT NULL,
    source_name text DEFAULT '2027쎈(SEN)진학 Preview'::text NOT NULL,
    source_version text DEFAULT 'V.7월2일'::text NOT NULL,
    region text NOT NULL,
    university_name text NOT NULL,
    university_key text NOT NULL,
    campus text,
    previous_year_changes text,
    selection_method text,
    minimum_requirements text,
    exam_schedule text,
    school_record_method text,
    recruitment_quota text,
    jungsi_guideline_url text,
    official_source_url text,
    memo text,
    detail_status text,
    matched_hwp_name text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    recruitment_result_html text,
    matched_text_name text,
    minimum_requirements_html text,
    school_record_method_html text,
    constraint admission_university_resources_pkey PRIMARY KEY (id),
    constraint admission_university_resources_unique UNIQUE (admission_year, university_key)
);

create table if not exists public."admission_university_resources_backup_20260709" (
    id uuid,
    admission_year integer,
    source_name text,
    source_version text,
    region text,
    university_name text,
    university_key text,
    campus text,
    previous_year_changes text,
    selection_method text,
    minimum_requirements text,
    exam_schedule text,
    school_record_method text,
    recruitment_quota text,
    jungsi_guideline_url text,
    official_source_url text,
    memo text,
    detail_status text,
    matched_hwp_name text,
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    recruitment_result_html text,
    matched_text_name text,
    minimum_requirements_html text,
    school_record_method_html text
);

create table if not exists public."admission_university_resources_backup_before_fix6" (
    id uuid,
    admission_year integer,
    source_name text,
    source_version text,
    region text,
    university_name text,
    university_key text,
    campus text,
    previous_year_changes text,
    selection_method text,
    minimum_requirements text,
    exam_schedule text,
    school_record_method text,
    recruitment_quota text,
    jungsi_guideline_url text,
    official_source_url text,
    memo text,
    detail_status text,
    matched_hwp_name text,
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    recruitment_result_html text,
    matched_text_name text,
    minimum_requirements_html text,
    school_record_method_html text
);

create table if not exists public."banners" (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    title text NOT NULL,
    highlight text,
    subtitle text,
    image_url text,
    button_text text DEFAULT '무료로 시작하기'::text,
    button_link text DEFAULT '/signup'::text,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint banners_pkey PRIMARY KEY (id)
);

create table if not exists public."company_news" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text,
    image_url text,
    image_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    file_url text,
    file_name text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    constraint company_news_pkey PRIMARY KEY (id)
);

create table if not exists public."coupons" (
    id text NOT NULL,
    code text,
    title text NOT NULL,
    discount_amount integer NOT NULL,
    min_amount integer DEFAULT 0 NOT NULL,
    valid_until date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    constraint coupons_pkey PRIMARY KEY (id),
    constraint coupons_code_key UNIQUE (code)
);

create table if not exists public."daily_entries" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_date date DEFAULT CURRENT_DATE,
    name text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text,
    program_name text DEFAULT ''::text,
    class_name text DEFAULT ''::text,
    memo text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint daily_entries_pkey PRIMARY KEY (id)
);

create table if not exists public."daily_settlements" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settlement_date date DEFAULT CURRENT_DATE,
    total_sale_amount integer DEFAULT 0,
    total_discount_amount integer DEFAULT 0,
    total_paid_amount integer DEFAULT 0,
    total_refund_amount integer DEFAULT 0,
    memo text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint daily_settlements_pkey PRIMARY KEY (id)
);

create table if not exists public."enrollments" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid,
    term_name text DEFAULT ''::text,
    category_name text DEFAULT ''::text,
    program_name text DEFAULT ''::text,
    class_name text DEFAULT ''::text,
    guardian_name text DEFAULT ''::text,
    student_name text DEFAULT ''::text,
    phone text DEFAULT ''::text,
    grade text DEFAULT ''::text,
    school_name text DEFAULT ''::text,
    application_status text DEFAULT '신청완료'::text,
    payment_status text DEFAULT '납부대기'::text,
    price integer DEFAULT 0,
    discount_amount integer DEFAULT 0,
    paid_amount integer DEFAULT 0,
    memo text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint enrollments_pkey PRIMARY KEY (id)
);

create table if not exists public."faqs" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text DEFAULT ''::text NOT NULL,
    answer text DEFAULT ''::text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint faqs_pkey PRIMARY KEY (id)
);

create table if not exists public."free_diagnosis_options" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_key text,
    option_text text NOT NULL,
    program_keys text DEFAULT ''::text,
    sort_order integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    question_id uuid,
    label text DEFAULT ''::text,
    program_ids text[] DEFAULT '{}'::text[],
    constraint free_diagnosis_options_pkey PRIMARY KEY (id)
);

create table if not exists public."free_diagnosis_programs" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_key text,
    title text NOT NULL,
    badge text DEFAULT '추천 서비스'::text,
    description text DEFAULT ''::text,
    service_link text DEFAULT ''::text,
    service_button_text text DEFAULT '서비스 확인하기'::text,
    payment_link text DEFAULT ''::text,
    payment_button_text text DEFAULT '자세히 보기'::text,
    icon text DEFAULT 'default'::text,
    sort_order integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    primary_button_text text DEFAULT '서비스 확인하기'::text,
    primary_button_link text DEFAULT ''::text,
    secondary_button_text text DEFAULT ''::text,
    secondary_button_link text DEFAULT ''::text,
    constraint free_diagnosis_programs_pkey PRIMARY KEY (id),
    constraint free_diagnosis_programs_program_key_key UNIQUE (program_key)
);

create table if not exists public."free_diagnosis_questions" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_key text,
    title text NOT NULL,
    description text DEFAULT ''::text,
    input_type text DEFAULT 'single'::text NOT NULL,
    is_required boolean DEFAULT true,
    sort_order integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint free_diagnosis_questions_pkey PRIMARY KEY (id),
    constraint free_diagnosis_questions_question_key_key UNIQUE (question_key),
    constraint free_diagnosis_questions_input_type_check CHECK ((input_type = ANY (ARRAY['single'::text, 'multiple'::text])))
);

create table if not exists public."galleries" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    content text DEFAULT ''::text,
    image_url text DEFAULT ''::text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    image_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    constraint galleries_pkey PRIMARY KEY (id)
);

create table if not exists public."home_acceptance_cards" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_name text NOT NULL,
    result_title text NOT NULL,
    description text,
    image_url text,
    link_url text,
    open_new_window boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    constraint home_acceptance_cards_pkey PRIMARY KEY (id)
);

create table if not exists public."home_mentor_strategies" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mentor_name text NOT NULL,
    title text NOT NULL,
    description text,
    image_url text,
    link_url text,
    open_new_window boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    constraint home_mentor_strategies_pkey PRIMARY KEY (id)
);

create table if not exists public."home_side_banners" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    subtitle text,
    link_url text,
    open_new_window boolean DEFAULT false NOT NULL,
    image_url text,
    mobile_image_url text,
    start_date date,
    end_date date,
    sort_order integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    constraint home_side_banners_pkey PRIMARY KEY (id),
    constraint home_side_banners_date_check CHECK (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date)))
);

create table if not exists public."notices" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    content text DEFAULT ''::text,
    is_pinned boolean DEFAULT false,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    image_url text DEFAULT ''::text,
    file_url text DEFAULT ''::text,
    file_name text DEFAULT ''::text,
    image_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    constraint notices_pkey PRIMARY KEY (id)
);

create table if not exists public."order_items" (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    order_id text NOT NULL,
    product_id text,
    service_key text,
    name text NOT NULL,
    list_price integer DEFAULT 0 NOT NULL,
    price integer DEFAULT 0 NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    constraint order_items_pkey PRIMARY KEY (id)
);

create table if not exists public."orders" (
    id text NOT NULL,
    user_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    order_name text,
    list_amount integer DEFAULT 0 NOT NULL,
    discount_amount integer DEFAULT 0 NOT NULL,
    amount integer NOT NULL,
    coupon_id text,
    customer_email text,
    payment_key text,
    method text,
    paid_at timestamp with time zone,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    constraint orders_pkey PRIMARY KEY (id)
);

create table if not exists public."page_contents" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_group text DEFAULT ''::text NOT NULL,
    menu_label text DEFAULT ''::text NOT NULL,
    slug text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    subtitle text DEFAULT ''::text,
    body text DEFAULT ''::text,
    image_url text DEFAULT ''::text,
    button_text text DEFAULT ''::text,
    button_link text DEFAULT ''::text,
    sort_order integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    menu_group_order integer DEFAULT 1,
    image_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    constraint page_contents_pkey PRIMARY KEY (id),
    constraint page_contents_slug_key UNIQUE (slug)
);

create table if not exists public."page_contents_backup_before_menu_rework_20260707" (
    id uuid,
    menu_group text,
    menu_label text,
    slug text,
    title text,
    subtitle text,
    body text,
    image_url text,
    button_text text,
    button_link text,
    sort_order integer,
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    menu_group_order integer,
    image_urls jsonb
);

create table if not exists public."payments" (
    payment_id uuid DEFAULT gen_random_uuid() NOT NULL,
    id uuid NOT NULL,
    program_key text NOT NULL,
    order_id text,
    payment_provider text,
    provider_payment_id text,
    amount integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    raw_payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    constraint payments_pkey PRIMARY KEY (payment_id),
    constraint payments_order_id_key UNIQUE (order_id),
    constraint payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text, 'cancelled'::text])))
);

create table if not exists public."popups" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    content text DEFAULT ''::text,
    url text DEFAULT ''::text,
    image_url text DEFAULT ''::text,
    start_date date,
    end_date date,
    open_new_window boolean DEFAULT false,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    mobile_image_url text DEFAULT ''::text,
    constraint popups_pkey PRIMARY KEY (id)
);

create table if not exists public."products" (
    id text NOT NULL,
    service_key text NOT NULL,
    service_name text NOT NULL,
    service_desc text,
    service_sort_order integer DEFAULT 99 NOT NULL,
    sort_order integer DEFAULT 99 NOT NULL,
    name text NOT NULL,
    list_price integer NOT NULL,
    price integer NOT NULL,
    badge text,
    is_recommended boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    constraint products_pkey PRIMARY KEY (id)
);

create table if not exists public."profiles" (
    id uuid NOT NULL,
    name text,
    phone text,
    role text DEFAULT 'user'::text,
    created_at timestamp with time zone DEFAULT now(),
    username text,
    email text,
    region text,
    school_type text,
    school_name text,
    terms_service_agreed boolean DEFAULT false,
    privacy_required_agreed boolean DEFAULT false,
    privacy_optional_agreed boolean DEFAULT false,
    marketing_agreed boolean DEFAULT false,
    ads_agreed boolean DEFAULT false,
    member_type text,
    updated_at timestamp with time zone DEFAULT now(),
    birth_date date,
    gender text,
    landline text,
    address text,
    address_detail text,
    sms_agreed boolean DEFAULT false,
    memo text,
    is_active boolean DEFAULT true,
    payment_terminal_id text,
    constraint profiles_pkey PRIMARY KEY (id),
    constraint profiles_role_check CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text])))
);

create table if not exists public."program_access" (
    id uuid NOT NULL,
    program_key text NOT NULL,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    access_status text DEFAULT 'inactive'::text NOT NULL,
    paid_amount integer DEFAULT 0,
    paid_at timestamp with time zone,
    access_started_at timestamp with time zone,
    access_expires_at timestamp with time zone,
    memo text,
    meta jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    profile_id uuid,
    user_id uuid,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    constraint program_access_pkey PRIMARY KEY (id, program_key),
    constraint program_access_access_status_check CHECK ((access_status = ANY (ARRAY['inactive'::text, 'active'::text, 'expired'::text, 'suspended'::text]))),
    constraint program_access_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'pending'::text, 'paid'::text, 'refunded'::text, 'cancelled'::text])))
);

create table if not exists public."program_categories" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    link text DEFAULT '/services'::text,
    icon text DEFAULT 'default'::text,
    constraint program_categories_pkey PRIMARY KEY (id)
);

create table if not exists public."programs" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_key text NOT NULL,
    name text NOT NULL,
    app_url text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint programs_pkey PRIMARY KEY (id),
    constraint programs_program_key_key UNIQUE (program_key)
);

create table if not exists public."refund_requests" (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    user_id uuid,
    order_id text,
    order_name text,
    amount integer DEFAULT 0 NOT NULL,
    reason text,
    refund_bank text,
    refund_account text,
    refund_holder text,
    status text DEFAULT 'requested'::text NOT NULL,
    admin_memo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    constraint refund_requests_pkey PRIMARY KEY (id)
);

create table if not exists public."refunds" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    payer_name text DEFAULT ''::text,
    program_name text DEFAULT ''::text,
    class_name text DEFAULT ''::text,
    paid_amount integer DEFAULT 0,
    refund_amount integer DEFAULT 0,
    reason text DEFAULT ''::text,
    status text DEFAULT '취소요청'::text,
    requested_at timestamp with time zone DEFAULT now(),
    memo text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint refunds_pkey PRIMARY KEY (id)
);

create table if not exists public."reviews" (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    student_name text,
    school_result text,
    content text NOT NULL,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    constraint reviews_pkey PRIMARY KEY (id)
);

create table if not exists public."services" (
    id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    description text,
    icon text,
    link text,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    constraint services_pkey PRIMARY KEY (id),
    constraint services_slug_key UNIQUE (slug)
);

create table if not exists public."sso_tickets" (
    ticket_id uuid NOT NULL,
    ticket_hash text NOT NULL,
    service_key text NOT NULL,
    winning_user_id uuid NOT NULL,
    user_name text,
    issued_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    used_by_service text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    constraint sso_tickets_pkey PRIMARY KEY (ticket_id),
    constraint sso_tickets_ticket_hash_key UNIQUE (ticket_hash)
);

create table if not exists public."usage_status" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    term_name text DEFAULT ''::text,
    category_name text DEFAULT ''::text,
    program_name text DEFAULT ''::text,
    class_name text DEFAULT ''::text,
    capacity integer DEFAULT 0,
    applicant_count integer DEFAULT 0,
    confirmed_count integer DEFAULT 0,
    remaining_count integer DEFAULT 0,
    status text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint usage_status_pkey PRIMARY KEY (id)
);

create table if not exists public."winning_assessment_knowledge_items" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_active boolean DEFAULT true,
    grade text NOT NULL,
    subject text NOT NULL,
    knowledge_type text NOT NULL,
    career_field text,
    title text NOT NULL,
    content text NOT NULL,
    source text,
    memo text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    search_text text,
    embedding vector(768),
    embedding_model text DEFAULT 'gemini-embedding-2'::text,
    embedding_status text DEFAULT 'pending'::text,
    embedded_at timestamp with time zone,
    embedding_error text,
    keywords text DEFAULT ''::text,
    rag_use boolean DEFAULT true,
    constraint winning_assessment_knowledge_items_pkey PRIMARY KEY (id),
    constraint winning_assessment_knowledge_items_knowledge_type_check CHECK ((knowledge_type = ANY (ARRAY['topic_pattern'::text, 'verified_resource'::text, 'student_record_pattern'::text])))
);

create table if not exists public."winning_base_data" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_type text DEFAULT ''::text,
    title text DEFAULT ''::text NOT NULL,
    content text DEFAULT ''::text,
    source text DEFAULT ''::text,
    memo text DEFAULT ''::text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint winning_base_data_pkey PRIMARY KEY (id)
);

create table if not exists public."winning_db_inputs" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    input_type text DEFAULT ''::text,
    title text DEFAULT ''::text NOT NULL,
    raw_data text DEFAULT ''::text,
    parsed_data jsonb,
    memo text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    constraint winning_db_inputs_pkey PRIMARY KEY (id)
);

-- ------------------------------------------------------------
-- 4. FOREIGN KEYS
-- ------------------------------------------------------------
alter table public."admin_classes" drop constraint if exists admin_classes_program_id_fkey;
alter table public."admin_classes" add constraint admin_classes_program_id_fkey FOREIGN KEY (program_id) REFERENCES admin_programs(id) ON DELETE SET NULL;
alter table public."admin_classes" drop constraint if exists admin_classes_term_id_fkey;
alter table public."admin_classes" add constraint admin_classes_term_id_fkey FOREIGN KEY (term_id) REFERENCES admin_terms(id) ON DELETE SET NULL;
alter table public."admin_enrollments" drop constraint if exists admin_enrollments_class_id_fkey;
alter table public."admin_enrollments" add constraint admin_enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES admin_classes(id) ON DELETE SET NULL;
alter table public."admin_enrollments" drop constraint if exists admin_enrollments_profile_id_fkey;
alter table public."admin_enrollments" add constraint admin_enrollments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."admin_payments" drop constraint if exists admin_payments_enrollment_id_fkey;
alter table public."admin_payments" add constraint admin_payments_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES admin_enrollments(id) ON DELETE SET NULL;
alter table public."admin_programs" drop constraint if exists admin_programs_category_id_fkey;
alter table public."admin_programs" add constraint admin_programs_category_id_fkey FOREIGN KEY (category_id) REFERENCES admin_program_categories(id) ON DELETE SET NULL;
alter table public."admin_refunds" drop constraint if exists admin_refunds_payment_id_fkey;
alter table public."admin_refunds" add constraint admin_refunds_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES admin_payments(id) ON DELETE SET NULL;
alter table public."enrollments" drop constraint if exists enrollments_profile_id_fkey;
alter table public."enrollments" add constraint enrollments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public."free_diagnosis_options" drop constraint if exists free_diagnosis_options_question_id_fkey;
alter table public."free_diagnosis_options" add constraint free_diagnosis_options_question_id_fkey FOREIGN KEY (question_id) REFERENCES free_diagnosis_questions(id) ON DELETE CASCADE;
alter table public."free_diagnosis_options" drop constraint if exists free_diagnosis_options_question_key_fkey;
alter table public."free_diagnosis_options" add constraint free_diagnosis_options_question_key_fkey FOREIGN KEY (question_key) REFERENCES free_diagnosis_questions(question_key) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public."order_items" drop constraint if exists order_items_order_id_fkey;
alter table public."order_items" add constraint order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public."orders" drop constraint if exists orders_coupon_id_fkey;
alter table public."orders" add constraint orders_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL;
alter table public."orders" drop constraint if exists orders_user_id_fkey;
alter table public."orders" add constraint orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."payments" drop constraint if exists payments_id_fkey;
alter table public."payments" add constraint payments_id_fkey FOREIGN KEY (id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."payments" drop constraint if exists payments_program_key_fkey;
alter table public."payments" add constraint payments_program_key_fkey FOREIGN KEY (program_key) REFERENCES programs(program_key);
alter table public."profiles" drop constraint if exists profiles_id_fkey;
alter table public."profiles" add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."program_access" drop constraint if exists program_access_id_fkey;
alter table public."program_access" add constraint program_access_id_fkey FOREIGN KEY (id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."program_access" drop constraint if exists program_access_program_key_fkey;
alter table public."program_access" add constraint program_access_program_key_fkey FOREIGN KEY (program_key) REFERENCES programs(program_key) ON DELETE CASCADE;
alter table public."refund_requests" drop constraint if exists refund_requests_order_id_fkey;
alter table public."refund_requests" add constraint refund_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public."refund_requests" drop constraint if exists refund_requests_user_id_fkey;
alter table public."refund_requests" add constraint refund_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 5. SEQUENCES 보정 (OWNED BY)
-- ------------------------------------------------------------
alter sequence public."admission_jungsi_results_id_seq" owned by public."admission_jungsi_results".id;
alter sequence public."admission_susi_results_id_seq" owned by public."admission_susi_results".id;

-- ------------------------------------------------------------
-- 6. INDEXES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS admin_enrollments_profile_idx ON public.admin_enrollments USING btree (profile_id);
CREATE INDEX IF NOT EXISTS admission_posts_active_category_idx ON public.admission_posts USING btree (is_active, category);
CREATE INDEX IF NOT EXISTS admission_posts_category_idx ON public.admission_posts USING btree (category);
CREATE INDEX IF NOT EXISTS admission_posts_order_idx ON public.admission_posts USING btree (category, is_pinned DESC, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS admission_university_resources_active_idx ON public.admission_university_resources USING btree (is_active);
CREATE INDEX IF NOT EXISTS admission_university_resources_name_idx ON public.admission_university_resources USING btree (university_name);
CREATE INDEX IF NOT EXISTS admission_university_resources_region_idx ON public.admission_university_resources USING btree (region);
CREATE UNIQUE INDEX IF NOT EXISTS admission_university_resources_year_key_uidx ON public.admission_university_resources USING btree (admission_year, university_key);
CREATE UNIQUE INDEX IF NOT EXISTS banners_seed_unique_idx ON public.banners USING btree (COALESCE(title, ''::text), COALESCE(highlight, ''::text), COALESCE(subtitle, ''::text), COALESCE(image_url, ''::text), COALESCE(button_text, ''::text), COALESCE(button_link, ''::text), COALESCE(sort_order, 0));
CREATE INDEX IF NOT EXISTS company_news_display_idx ON public.company_news USING btree (is_active, is_pinned DESC, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS free_diagnosis_options_question_sort_idx ON public.free_diagnosis_options USING btree (question_id, is_active, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_free_diagnosis_options_question_order ON public.free_diagnosis_options USING btree (question_key, is_active, sort_order);
CREATE INDEX IF NOT EXISTS free_diagnosis_programs_sort_idx ON public.free_diagnosis_programs USING btree (is_active, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_free_diagnosis_programs_active_order ON public.free_diagnosis_programs USING btree (is_active, sort_order);
CREATE INDEX IF NOT EXISTS free_diagnosis_questions_sort_idx ON public.free_diagnosis_questions USING btree (is_active, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_free_diagnosis_questions_active_order ON public.free_diagnosis_questions USING btree (is_active, sort_order);
CREATE INDEX IF NOT EXISTS home_acceptance_cards_display_idx ON public.home_acceptance_cards USING btree (is_active, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS home_mentor_strategies_display_idx ON public.home_mentor_strategies USING btree (is_active, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS home_side_banners_display_idx ON public.home_side_banners USING btree (is_active, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notices_events_visible ON public.notices USING btree (is_active, is_pinned, sort_order, created_at);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items USING btree (order_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders USING btree (status);
CREATE INDEX IF NOT EXISTS orders_user_idx ON public.orders USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_id_program_created ON public.payments USING btree (id, program_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_popups_home_visible ON public.popups USING btree (is_active, sort_order, start_date, end_date);
CREATE INDEX IF NOT EXISTS products_active_idx ON public.products USING btree (is_active, service_sort_order, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx ON public.profiles USING btree (lower(TRIM(BOTH FROM email))) WHERE ((email IS NOT NULL) AND (TRIM(BOTH FROM email) <> ''::text));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx ON public.profiles USING btree (lower(TRIM(BOTH FROM username))) WHERE ((username IS NOT NULL) AND (TRIM(BOTH FROM username) <> ''::text));
CREATE INDEX IF NOT EXISTS idx_program_access_id_program ON public.program_access USING btree (id, program_key);
CREATE INDEX IF NOT EXISTS idx_program_access_user_program ON public.program_access USING btree (user_id, program_key) WHERE ((user_id IS NOT NULL) AND (program_key IS NOT NULL));
CREATE INDEX IF NOT EXISTS program_access_program_profile_idx ON public.program_access USING btree (program_key, profile_id);
CREATE INDEX IF NOT EXISTS program_access_program_user_idx ON public.program_access USING btree (program_key, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_program_access_id_program_key ON public.program_access USING btree (id, program_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_program_access_profile_program ON public.program_access USING btree (profile_id, program_key) WHERE ((profile_id IS NOT NULL) AND (program_key IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS program_categories_name_unique_idx ON public.program_categories USING btree (lower(TRIM(BOTH FROM name))) WHERE ((name IS NOT NULL) AND (TRIM(BOTH FROM name) <> ''::text));
CREATE INDEX IF NOT EXISTS refund_requests_user_idx ON public.refund_requests USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sso_tickets_unused ON public.sso_tickets USING btree (service_key, expires_at) WHERE (used_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_sso_tickets_user_service ON public.sso_tickets USING btree (winning_user_id, service_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_winning_assessment_knowledge_career ON public.winning_assessment_knowledge_items USING btree (career_field);
CREATE INDEX IF NOT EXISTS idx_winning_assessment_knowledge_created ON public.winning_assessment_knowledge_items USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_winning_assessment_knowledge_lookup ON public.winning_assessment_knowledge_items USING btree (is_active, grade, subject, knowledge_type);
CREATE INDEX IF NOT EXISTS idx_winning_assessment_knowledge_type_created ON public.winning_assessment_knowledge_items USING btree (knowledge_type, created_at DESC);
CREATE INDEX IF NOT EXISTS winning_suhaeng_embedding_hnsw_idx ON public.winning_assessment_knowledge_items USING hnsw (embedding vector_cosine_ops) WHERE (embedding IS NOT NULL);
CREATE INDEX IF NOT EXISTS winning_suhaeng_filter_idx ON public.winning_assessment_knowledge_items USING btree (knowledge_type, grade, is_active, rag_use);

-- ------------------------------------------------------------
-- 7. FUNCTIONS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_signup_profile(p_name text, p_username text, p_phone text, p_email text, p_region text, p_school_type text, p_school_name text, p_member_type text, p_terms_service_agreed boolean, p_privacy_required_agreed boolean, p_privacy_optional_agreed boolean, p_marketing_agreed boolean, p_ads_agreed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_name text;
  v_username text;
  v_phone text;
  v_email text;
  v_region text;
  v_school_type text;
  v_school_name text;
  v_member_type text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  v_name := trim(coalesce(p_name, ''));
  v_email := lower(trim(coalesce(p_email, '')));
  v_username := lower(trim(coalesce(nullif(p_username, ''), v_email)));
  v_phone := trim(coalesce(p_phone, ''));
  v_region := trim(coalesce(p_region, ''));
  v_school_type := trim(coalesce(p_school_type, ''));
  v_school_name := trim(coalesce(p_school_name, ''));
  v_member_type := trim(coalesce(p_member_type, ''));

  if v_name = '' then
    raise exception 'name_required';
  end if;

  if v_email = '' then
    raise exception 'email_required';
  end if;

  if v_username = '' then
    v_username := v_email;
  end if;

  if v_region = '' then
    raise exception 'region_required';
  end if;

  if v_school_type = '' then
    raise exception 'school_type_required';
  end if;

  if v_member_type = '' then
    raise exception 'member_type_required';
  end if;

  if coalesce(p_terms_service_agreed, false) is not true then
    raise exception 'terms_service_required';
  end if;

  if coalesce(p_privacy_required_agreed, false) is not true then
    raise exception 'privacy_required';
  end if;

  if exists (
    select 1
    from public.profiles
    where lower(trim(email)) = v_email
      and id <> v_user_id
  ) then
    raise exception 'duplicate_email';
  end if;

  insert into public.profiles (
    id,
    name,
    username,
    phone,
    email,
    region,
    school_type,
    school_name,
    member_type,
    role,
    terms_service_agreed,
    privacy_required_agreed,
    privacy_optional_agreed,
    marketing_agreed,
    ads_agreed,
    updated_at
  )
  values (
    v_user_id,
    v_name,
    v_username,
    v_phone,
    v_email,
    v_region,
    v_school_type,
    v_school_name,
    v_member_type,
    'user',
    coalesce(p_terms_service_agreed, false),
    coalesce(p_privacy_required_agreed, false),
    coalesce(p_privacy_optional_agreed, false),
    coalesce(p_marketing_agreed, false),
    coalesce(p_ads_agreed, false),
    now()
  )
  on conflict (id) do update
  set
    name = excluded.name,
    username = excluded.username,
    phone = excluded.phone,
    email = excluded.email,
    region = excluded.region,
    school_type = excluded.school_type,
    school_name = excluded.school_name,
    member_type = excluded.member_type,
    role = coalesce(public.profiles.role, 'user'),
    terms_service_agreed = excluded.terms_service_agreed,
    privacy_required_agreed = excluded.privacy_required_agreed,
    privacy_optional_agreed = excluded.privacy_optional_agreed,
    marketing_agreed = excluded.marketing_agreed,
    ads_agreed = excluded.ads_agreed,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'id', v_user_id,
    'email', v_email
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (
    id,
    email,
    role,
    updated_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    'user',
    now()
  )
  on conflict (id) do update
  set
    email = coalesce(nullif(excluded.email, ''), public.profiles.email),
    role = coalesce(public.profiles.role, 'user'),
    updated_at = now();

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_email_available(check_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_email text;
  v_exists_profiles boolean;
  v_exists_auth boolean;
begin
  v_email := lower(trim(coalesce(check_email, '')));

  if v_email = '' then
    return false;
  end if;

  select exists (
    select 1
    from public.profiles p
    where lower(trim(p.email)) = v_email
  ) into v_exists_profiles;

  select exists (
    select 1
    from auth.users u
    where lower(trim(u.email)) = v_email
  ) into v_exists_auth;

  return not (coalesce(v_exists_profiles, false) or coalesce(v_exists_auth, false));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_username_available(check_username text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not exists (
    select 1
    from public.profiles p
    where lower(trim(p.username)) = lower(trim(check_username))
      and p.username is not null
      and trim(p.username) <> ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_winning_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles
    where (
      profiles.id = auth.uid()
      or lower(profiles.email) = lower(auth.jwt() ->> 'email')
    )
    and profiles.role in ('admin', 'admin_basic', 'admin_manager', 'admin_master')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.match_winning_suhaeng_all_subjects(query_embedding vector, filter_knowledge_type text, filter_grade text DEFAULT NULL::text, match_count integer DEFAULT 10, match_threshold double precision DEFAULT 0.52)
 RETURNS TABLE(id uuid, knowledge_type text, grade text, subject text, career_field text, title text, content text, source text, memo text, similarity double precision)
 LANGUAGE sql
 STABLE
AS $function$
  select
    w.id,
    w.knowledge_type,
    w.grade,
    w.subject,
    w.career_field,
    w.title,
    w.content,
    w.source,
    w.memo,
    1 - (w.embedding <=> query_embedding) as similarity
  from public.winning_assessment_knowledge_items w
  where w.is_active = true
    and coalesce(w.rag_use, true) = true
    and w.embedding is not null
    and w.knowledge_type in ('topic_pattern', 'verified_resource')
    and w.knowledge_type = filter_knowledge_type
    and (
      filter_grade is null
      or w.grade = filter_grade
      or w.grade in ('공통', '전체', '확인 필요')
    )
    and 1 - (w.embedding <=> query_embedding) >= match_threshold
  order by w.embedding <=> query_embedding asc
  limit least(match_count, 20);
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_homepage_content_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

-- ------------------------------------------------------------
-- 8. TRIGGERS (public)
-- ------------------------------------------------------------
drop trigger if exists set_admin_banners_updated_at on public."admin_banners";
CREATE TRIGGER set_admin_banners_updated_at BEFORE UPDATE ON public.admin_banners FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_cancel_reasons_updated_at on public."admin_cancel_reasons";
CREATE TRIGGER set_admin_cancel_reasons_updated_at BEFORE UPDATE ON public.admin_cancel_reasons FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_classes_updated_at on public."admin_classes";
CREATE TRIGGER set_admin_classes_updated_at BEFORE UPDATE ON public.admin_classes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_discount_reasons_updated_at on public."admin_discount_reasons";
CREATE TRIGGER set_admin_discount_reasons_updated_at BEFORE UPDATE ON public.admin_discount_reasons FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_enrollments_updated_at on public."admin_enrollments";
CREATE TRIGGER set_admin_enrollments_updated_at BEFORE UPDATE ON public.admin_enrollments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_faqs_updated_at on public."admin_faqs";
CREATE TRIGGER set_admin_faqs_updated_at BEFORE UPDATE ON public.admin_faqs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_galleries_updated_at on public."admin_galleries";
CREATE TRIGGER set_admin_galleries_updated_at BEFORE UPDATE ON public.admin_galleries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_notices_updated_at on public."admin_notices";
CREATE TRIGGER set_admin_notices_updated_at BEFORE UPDATE ON public.admin_notices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_payments_updated_at on public."admin_payments";
CREATE TRIGGER set_admin_payments_updated_at BEFORE UPDATE ON public.admin_payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_popups_updated_at on public."admin_popups";
CREATE TRIGGER set_admin_popups_updated_at BEFORE UPDATE ON public.admin_popups FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_program_categories_updated_at on public."admin_program_categories";
CREATE TRIGGER set_admin_program_categories_updated_at BEFORE UPDATE ON public.admin_program_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_programs_updated_at on public."admin_programs";
CREATE TRIGGER set_admin_programs_updated_at BEFORE UPDATE ON public.admin_programs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_refunds_updated_at on public."admin_refunds";
CREATE TRIGGER set_admin_refunds_updated_at BEFORE UPDATE ON public.admin_refunds FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_admin_terms_updated_at on public."admin_terms";
CREATE TRIGGER set_admin_terms_updated_at BEFORE UPDATE ON public.admin_terms FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_banners_updated_at on public."banners";
CREATE TRIGGER trg_banners_updated_at BEFORE UPDATE ON public.banners FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_company_news_updated_at on public."company_news";
CREATE TRIGGER set_company_news_updated_at BEFORE UPDATE ON public.company_news FOR EACH ROW EXECUTE FUNCTION set_homepage_content_updated_at();

drop trigger if exists trg_daily_entries_updated_at on public."daily_entries";
CREATE TRIGGER trg_daily_entries_updated_at BEFORE UPDATE ON public.daily_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_daily_settlements_updated_at on public."daily_settlements";
CREATE TRIGGER trg_daily_settlements_updated_at BEFORE UPDATE ON public.daily_settlements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_enrollments_updated_at on public."enrollments";
CREATE TRIGGER trg_enrollments_updated_at BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_faqs_updated_at on public."faqs";
CREATE TRIGGER trg_faqs_updated_at BEFORE UPDATE ON public.faqs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_free_diagnosis_options_updated_at on public."free_diagnosis_options";
CREATE TRIGGER set_free_diagnosis_options_updated_at BEFORE UPDATE ON public.free_diagnosis_options FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_free_diagnosis_programs_updated_at on public."free_diagnosis_programs";
CREATE TRIGGER set_free_diagnosis_programs_updated_at BEFORE UPDATE ON public.free_diagnosis_programs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_free_diagnosis_questions_updated_at on public."free_diagnosis_questions";
CREATE TRIGGER set_free_diagnosis_questions_updated_at BEFORE UPDATE ON public.free_diagnosis_questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_galleries_updated_at on public."galleries";
CREATE TRIGGER trg_galleries_updated_at BEFORE UPDATE ON public.galleries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists set_home_acceptance_cards_updated_at on public."home_acceptance_cards";
CREATE TRIGGER set_home_acceptance_cards_updated_at BEFORE UPDATE ON public.home_acceptance_cards FOR EACH ROW EXECUTE FUNCTION set_homepage_content_updated_at();

drop trigger if exists set_home_mentor_strategies_updated_at on public."home_mentor_strategies";
CREATE TRIGGER set_home_mentor_strategies_updated_at BEFORE UPDATE ON public.home_mentor_strategies FOR EACH ROW EXECUTE FUNCTION set_homepage_content_updated_at();

drop trigger if exists set_home_side_banners_updated_at on public."home_side_banners";
CREATE TRIGGER set_home_side_banners_updated_at BEFORE UPDATE ON public.home_side_banners FOR EACH ROW EXECUTE FUNCTION set_homepage_content_updated_at();

drop trigger if exists trg_notices_updated_at on public."notices";
CREATE TRIGGER trg_notices_updated_at BEFORE UPDATE ON public.notices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_page_contents_updated_at on public."page_contents";
CREATE TRIGGER trg_page_contents_updated_at BEFORE UPDATE ON public.page_contents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_popups_updated_at on public."popups";
CREATE TRIGGER trg_popups_updated_at BEFORE UPDATE ON public.popups FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_program_categories_updated_at on public."program_categories";
CREATE TRIGGER trg_program_categories_updated_at BEFORE UPDATE ON public.program_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_refunds_updated_at on public."refunds";
CREATE TRIGGER trg_refunds_updated_at BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_usage_status_updated_at on public."usage_status";
CREATE TRIGGER trg_usage_status_updated_at BEFORE UPDATE ON public.usage_status FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_winning_base_data_updated_at on public."winning_base_data";
CREATE TRIGGER trg_winning_base_data_updated_at BEFORE UPDATE ON public.winning_base_data FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_winning_db_inputs_updated_at on public."winning_db_inputs";
CREATE TRIGGER trg_winning_db_inputs_updated_at BEFORE UPDATE ON public.winning_db_inputs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 8b. AUTH 스키마 트리거 (public 함수 참조)
-- 주의: dev 환경 auth.users 에도 동일 트리거 재생성 필요
-- ------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth."users";
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ------------------------------------------------------------
-- 9. VIEWS
-- ------------------------------------------------------------
-- (운영 DB에 public 스키마 뷰 없음)

-- ------------------------------------------------------------
-- 10. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public."admin_banners" enable row level security;
alter table public."admin_cancel_reasons" enable row level security;
alter table public."admin_classes" enable row level security;
alter table public."admin_discount_reasons" enable row level security;
alter table public."admin_enrollments" enable row level security;
alter table public."admin_faqs" enable row level security;
alter table public."admin_galleries" enable row level security;
alter table public."admin_notices" enable row level security;
alter table public."admin_payments" enable row level security;
alter table public."admin_popups" enable row level security;
alter table public."admin_program_categories" enable row level security;
alter table public."admin_programs" enable row level security;
alter table public."admin_refunds" enable row level security;
alter table public."admin_terms" enable row level security;
alter table public."admission_jungsi_results" enable row level security;
alter table public."admission_posts" enable row level security;
alter table public."admission_susi_results" enable row level security;
alter table public."admission_university_resources" enable row level security;
alter table public."admission_university_resources_backup_20260709" enable row level security;
alter table public."admission_university_resources_backup_before_fix6" enable row level security;
alter table public."banners" enable row level security;
alter table public."company_news" enable row level security;
alter table public."coupons" enable row level security;
alter table public."daily_entries" enable row level security;
alter table public."daily_settlements" enable row level security;
alter table public."enrollments" enable row level security;
alter table public."faqs" enable row level security;
alter table public."free_diagnosis_options" enable row level security;
alter table public."free_diagnosis_programs" enable row level security;
alter table public."free_diagnosis_questions" enable row level security;
alter table public."galleries" enable row level security;
alter table public."home_acceptance_cards" enable row level security;
alter table public."home_mentor_strategies" enable row level security;
alter table public."home_side_banners" enable row level security;
alter table public."notices" enable row level security;
alter table public."order_items" enable row level security;
alter table public."orders" enable row level security;
alter table public."page_contents" enable row level security;
alter table public."page_contents_backup_before_menu_rework_20260707" enable row level security;
alter table public."payments" enable row level security;
alter table public."popups" enable row level security;
alter table public."products" enable row level security;
alter table public."profiles" enable row level security;
alter table public."program_access" enable row level security;
alter table public."program_categories" enable row level security;
alter table public."programs" enable row level security;
alter table public."refund_requests" enable row level security;
alter table public."refunds" enable row level security;
alter table public."reviews" enable row level security;
alter table public."services" enable row level security;
alter table public."sso_tickets" enable row level security;
alter table public."usage_status" enable row level security;
alter table public."winning_assessment_knowledge_items" enable row level security;
alter table public."winning_base_data" enable row level security;
alter table public."winning_db_inputs" enable row level security;

drop policy if exists "admin_banners_admin_all" on public."admin_banners";
create policy "admin_banners_admin_all" on public."admin_banners" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_cancel_reasons_admin_all" on public."admin_cancel_reasons";
create policy "admin_cancel_reasons_admin_all" on public."admin_cancel_reasons" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_classes_admin_all" on public."admin_classes";
create policy "admin_classes_admin_all" on public."admin_classes" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_discount_reasons_admin_all" on public."admin_discount_reasons";
create policy "admin_discount_reasons_admin_all" on public."admin_discount_reasons" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_enrollments_admin_all" on public."admin_enrollments";
create policy "admin_enrollments_admin_all" on public."admin_enrollments" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_faqs_admin_all" on public."admin_faqs";
create policy "admin_faqs_admin_all" on public."admin_faqs" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_galleries_admin_all" on public."admin_galleries";
create policy "admin_galleries_admin_all" on public."admin_galleries" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_notices_admin_all" on public."admin_notices";
create policy "admin_notices_admin_all" on public."admin_notices" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_payments_admin_all" on public."admin_payments";
create policy "admin_payments_admin_all" on public."admin_payments" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_popups_admin_all" on public."admin_popups";
create policy "admin_popups_admin_all" on public."admin_popups" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_program_categories_admin_all" on public."admin_program_categories";
create policy "admin_program_categories_admin_all" on public."admin_program_categories" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_programs_admin_all" on public."admin_programs";
create policy "admin_programs_admin_all" on public."admin_programs" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_refunds_admin_all" on public."admin_refunds";
create policy "admin_refunds_admin_all" on public."admin_refunds" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "admin_terms_admin_all" on public."admin_terms";
create policy "admin_terms_admin_all" on public."admin_terms" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "Public read jungsi results" on public."admission_jungsi_results";
create policy "Public read jungsi results" on public."admission_jungsi_results" as PERMISSIVE for SELECT to public
  using (true);

drop policy if exists "Admins can delete admission posts" on public."admission_posts";
create policy "Admins can delete admission posts" on public."admission_posts" as PERMISSIVE for DELETE to public
  using (is_winning_admin());

drop policy if exists "Admins can insert admission posts" on public."admission_posts";
create policy "Admins can insert admission posts" on public."admission_posts" as PERMISSIVE for INSERT to public
  with check (is_winning_admin());

drop policy if exists "Admins can read admission posts" on public."admission_posts";
create policy "Admins can read admission posts" on public."admission_posts" as PERMISSIVE for SELECT to public
  using (is_winning_admin());

drop policy if exists "Admins can update admission posts" on public."admission_posts";
create policy "Admins can update admission posts" on public."admission_posts" as PERMISSIVE for UPDATE to public
  using (is_winning_admin())
  with check (is_winning_admin());

drop policy if exists "Public can read active admission posts" on public."admission_posts";
create policy "Public can read active admission posts" on public."admission_posts" as PERMISSIVE for SELECT to public
  using ((is_active = true));

drop policy if exists "Public read susi results" on public."admission_susi_results";
create policy "Public read susi results" on public."admission_susi_results" as PERMISSIVE for SELECT to public
  using (true);

drop policy if exists "admission_university_resources_public_read" on public."admission_university_resources";
create policy "admission_university_resources_public_read" on public."admission_university_resources" as PERMISSIVE for SELECT to anon,authenticated
  using ((is_active = true));

drop policy if exists "Admin can manage banners" on public."banners";
create policy "Admin can manage banners" on public."banners" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "Anyone can view active banners" on public."banners";
create policy "Anyone can view active banners" on public."banners" as PERMISSIVE for SELECT to anon,authenticated
  using ((is_active = true));

drop policy if exists "banners_admin_all" on public."banners";
create policy "banners_admin_all" on public."banners" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "banners_admin_delete" on public."banners";
create policy "banners_admin_delete" on public."banners" as PERMISSIVE for DELETE to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));

drop policy if exists "banners_admin_insert" on public."banners";
create policy "banners_admin_insert" on public."banners" as PERMISSIVE for INSERT to authenticated
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));

drop policy if exists "banners_admin_select" on public."banners";
create policy "banners_admin_select" on public."banners" as PERMISSIVE for SELECT to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));

drop policy if exists "banners_admin_update" on public."banners";
create policy "banners_admin_update" on public."banners" as PERMISSIVE for UPDATE to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));

drop policy if exists "banners_public_read" on public."banners";
create policy "banners_public_read" on public."banners" as PERMISSIVE for SELECT to anon,authenticated
  using (((is_active = true) OR is_admin()));

drop policy if exists "banners_public_select_active" on public."banners";
create policy "banners_public_select_active" on public."banners" as PERMISSIVE for SELECT to anon,authenticated
  using ((is_active = true));

drop policy if exists "company_news_admin_delete" on public."company_news";
create policy "company_news_admin_delete" on public."company_news" as PERMISSIVE for DELETE to authenticated
  using (is_winning_admin());

drop policy if exists "company_news_admin_insert" on public."company_news";
create policy "company_news_admin_insert" on public."company_news" as PERMISSIVE for INSERT to authenticated
  with check (is_winning_admin());

drop policy if exists "company_news_admin_update" on public."company_news";
create policy "company_news_admin_update" on public."company_news" as PERMISSIVE for UPDATE to authenticated
  using (is_winning_admin())
  with check (is_winning_admin());

drop policy if exists "company_news_public_read" on public."company_news";
create policy "company_news_public_read" on public."company_news" as PERMISSIVE for SELECT to public
  using (((is_active = true) OR is_winning_admin()));

drop policy if exists "coupons public read" on public."coupons";
create policy "coupons public read" on public."coupons" as PERMISSIVE for SELECT to public
  using ((is_active = true));

drop policy if exists "daily_entries_admin_all" on public."daily_entries";
create policy "daily_entries_admin_all" on public."daily_entries" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "daily_settlements_admin_all" on public."daily_settlements";
create policy "daily_settlements_admin_all" on public."daily_settlements" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "enrollments_admin_all" on public."enrollments";
create policy "enrollments_admin_all" on public."enrollments" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "faqs_admin_all" on public."faqs";
create policy "faqs_admin_all" on public."faqs" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "faqs_public_read" on public."faqs";
create policy "faqs_public_read" on public."faqs" as PERMISSIVE for SELECT to anon,authenticated
  using (((is_active = true) OR is_admin()));

drop policy if exists "free diagnosis options admin all" on public."free_diagnosis_options";
create policy "free diagnosis options admin all" on public."free_diagnosis_options" as PERMISSIVE for ALL to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

drop policy if exists "free diagnosis options public read" on public."free_diagnosis_options";
create policy "free diagnosis options public read" on public."free_diagnosis_options" as PERMISSIVE for SELECT to public
  using ((is_active = true));

drop policy if exists "free diagnosis programs admin all" on public."free_diagnosis_programs";
create policy "free diagnosis programs admin all" on public."free_diagnosis_programs" as PERMISSIVE for ALL to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

drop policy if exists "free diagnosis programs public read" on public."free_diagnosis_programs";
create policy "free diagnosis programs public read" on public."free_diagnosis_programs" as PERMISSIVE for SELECT to public
  using ((is_active = true));

drop policy if exists "free diagnosis questions admin all" on public."free_diagnosis_questions";
create policy "free diagnosis questions admin all" on public."free_diagnosis_questions" as PERMISSIVE for ALL to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

drop policy if exists "free diagnosis questions public read" on public."free_diagnosis_questions";
create policy "free diagnosis questions public read" on public."free_diagnosis_questions" as PERMISSIVE for SELECT to public
  using ((is_active = true));

drop policy if exists "Admins can delete galleries" on public."galleries";
create policy "Admins can delete galleries" on public."galleries" as PERMISSIVE for DELETE to public
  using (is_winning_admin());

drop policy if exists "Admins can insert galleries" on public."galleries";
create policy "Admins can insert galleries" on public."galleries" as PERMISSIVE for INSERT to public
  with check (is_winning_admin());

drop policy if exists "Admins can read galleries" on public."galleries";
create policy "Admins can read galleries" on public."galleries" as PERMISSIVE for SELECT to public
  using (is_winning_admin());

drop policy if exists "Admins can update galleries" on public."galleries";
create policy "Admins can update galleries" on public."galleries" as PERMISSIVE for UPDATE to public
  using (is_winning_admin())
  with check (is_winning_admin());

drop policy if exists "Public can read active galleries" on public."galleries";
create policy "Public can read active galleries" on public."galleries" as PERMISSIVE for SELECT to public
  using ((is_active = true));

drop policy if exists "galleries_admin_all" on public."galleries";
create policy "galleries_admin_all" on public."galleries" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "galleries_public_read" on public."galleries";
create policy "galleries_public_read" on public."galleries" as PERMISSIVE for SELECT to anon,authenticated
  using (((is_active = true) OR is_admin()));

drop policy if exists "home_acceptance_cards_admin_delete" on public."home_acceptance_cards";
create policy "home_acceptance_cards_admin_delete" on public."home_acceptance_cards" as PERMISSIVE for DELETE to authenticated
  using (is_winning_admin());

drop policy if exists "home_acceptance_cards_admin_insert" on public."home_acceptance_cards";
create policy "home_acceptance_cards_admin_insert" on public."home_acceptance_cards" as PERMISSIVE for INSERT to authenticated
  with check (is_winning_admin());

drop policy if exists "home_acceptance_cards_admin_update" on public."home_acceptance_cards";
create policy "home_acceptance_cards_admin_update" on public."home_acceptance_cards" as PERMISSIVE for UPDATE to authenticated
  using (is_winning_admin())
  with check (is_winning_admin());

drop policy if exists "home_acceptance_cards_public_read" on public."home_acceptance_cards";
create policy "home_acceptance_cards_public_read" on public."home_acceptance_cards" as PERMISSIVE for SELECT to public
  using (((is_active = true) OR is_winning_admin()));

drop policy if exists "home_mentor_strategies_admin_delete" on public."home_mentor_strategies";
create policy "home_mentor_strategies_admin_delete" on public."home_mentor_strategies" as PERMISSIVE for DELETE to authenticated
  using (is_winning_admin());

drop policy if exists "home_mentor_strategies_admin_insert" on public."home_mentor_strategies";
create policy "home_mentor_strategies_admin_insert" on public."home_mentor_strategies" as PERMISSIVE for INSERT to authenticated
  with check (is_winning_admin());

drop policy if exists "home_mentor_strategies_admin_update" on public."home_mentor_strategies";
create policy "home_mentor_strategies_admin_update" on public."home_mentor_strategies" as PERMISSIVE for UPDATE to authenticated
  using (is_winning_admin())
  with check (is_winning_admin());

drop policy if exists "home_mentor_strategies_public_read" on public."home_mentor_strategies";
create policy "home_mentor_strategies_public_read" on public."home_mentor_strategies" as PERMISSIVE for SELECT to public
  using (((is_active = true) OR is_winning_admin()));

drop policy if exists "home_side_banners_admin_delete" on public."home_side_banners";
create policy "home_side_banners_admin_delete" on public."home_side_banners" as PERMISSIVE for DELETE to authenticated
  using (is_winning_admin());

drop policy if exists "home_side_banners_admin_insert" on public."home_side_banners";
create policy "home_side_banners_admin_insert" on public."home_side_banners" as PERMISSIVE for INSERT to authenticated
  with check (is_winning_admin());

drop policy if exists "home_side_banners_admin_update" on public."home_side_banners";
create policy "home_side_banners_admin_update" on public."home_side_banners" as PERMISSIVE for UPDATE to authenticated
  using (is_winning_admin())
  with check (is_winning_admin());

drop policy if exists "home_side_banners_public_read" on public."home_side_banners";
create policy "home_side_banners_public_read" on public."home_side_banners" as PERMISSIVE for SELECT to public
  using (((is_active = true) OR is_winning_admin()));

drop policy if exists "Admins can delete notices" on public."notices";
create policy "Admins can delete notices" on public."notices" as PERMISSIVE for DELETE to public
  using (is_winning_admin());

drop policy if exists "Admins can insert notices" on public."notices";
create policy "Admins can insert notices" on public."notices" as PERMISSIVE for INSERT to public
  with check (is_winning_admin());

drop policy if exists "Admins can read notices" on public."notices";
create policy "Admins can read notices" on public."notices" as PERMISSIVE for SELECT to public
  using (is_winning_admin());

drop policy if exists "Admins can update notices" on public."notices";
create policy "Admins can update notices" on public."notices" as PERMISSIVE for UPDATE to public
  using (is_winning_admin())
  with check (is_winning_admin());

drop policy if exists "Public can read active notices" on public."notices";
create policy "Public can read active notices" on public."notices" as PERMISSIVE for SELECT to public
  using ((is_active = true));

drop policy if exists "notices_admin_all" on public."notices";
create policy "notices_admin_all" on public."notices" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "notices_public_read" on public."notices";
create policy "notices_public_read" on public."notices" as PERMISSIVE for SELECT to anon,authenticated
  using (((is_active = true) OR is_admin()));

drop policy if exists "order_items select own" on public."order_items";
create policy "order_items select own" on public."order_items" as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.user_id = auth.uid())))));

drop policy if exists "orders select own" on public."orders";
create policy "orders select own" on public."orders" as PERMISSIVE for SELECT to public
  using ((auth.uid() = user_id));

drop policy if exists "Admins can delete page contents" on public."page_contents";
create policy "Admins can delete page contents" on public."page_contents" as PERMISSIVE for DELETE to public
  using (is_winning_admin());

drop policy if exists "Admins can insert page contents" on public."page_contents";
create policy "Admins can insert page contents" on public."page_contents" as PERMISSIVE for INSERT to public
  with check (is_winning_admin());

drop policy if exists "Admins can read page contents" on public."page_contents";
create policy "Admins can read page contents" on public."page_contents" as PERMISSIVE for SELECT to public
  using (is_winning_admin());

drop policy if exists "Admins can update page contents" on public."page_contents";
create policy "Admins can update page contents" on public."page_contents" as PERMISSIVE for UPDATE to public
  using (is_winning_admin())
  with check (is_winning_admin());

drop policy if exists "Public can read active page contents" on public."page_contents";
create policy "Public can read active page contents" on public."page_contents" as PERMISSIVE for SELECT to public
  using ((is_active = true));

drop policy if exists "page_contents_admin_all" on public."page_contents";
create policy "page_contents_admin_all" on public."page_contents" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "page_contents_public_read" on public."page_contents";
create policy "page_contents_public_read" on public."page_contents" as PERMISSIVE for SELECT to anon,authenticated
  using (((is_active = true) OR is_admin()));

drop policy if exists "payments_select_own" on public."payments";
create policy "payments_select_own" on public."payments" as PERMISSIVE for SELECT to authenticated
  using ((auth.uid() = id));

drop policy if exists "popups_admin_all" on public."popups";
create policy "popups_admin_all" on public."popups" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "popups_public_read" on public."popups";
create policy "popups_public_read" on public."popups" as PERMISSIVE for SELECT to anon,authenticated
  using (((is_active = true) OR is_admin()));

drop policy if exists "products public read" on public."products";
create policy "products public read" on public."products" as PERMISSIVE for SELECT to public
  using ((is_active = true));

drop policy if exists "profiles_admin_delete_all" on public."profiles";
create policy "profiles_admin_delete_all" on public."profiles" as PERMISSIVE for DELETE to authenticated
  using (is_admin());

drop policy if exists "profiles_admin_insert_all" on public."profiles";
create policy "profiles_admin_insert_all" on public."profiles" as PERMISSIVE for INSERT to authenticated
  with check (is_admin());

drop policy if exists "profiles_admin_select_all" on public."profiles";
create policy "profiles_admin_select_all" on public."profiles" as PERMISSIVE for SELECT to authenticated
  using (is_admin());

drop policy if exists "profiles_admin_update_all" on public."profiles";
create policy "profiles_admin_update_all" on public."profiles" as PERMISSIVE for UPDATE to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "profiles_insert_own" on public."profiles";
create policy "profiles_insert_own" on public."profiles" as PERMISSIVE for INSERT to authenticated
  with check (((auth.uid() = id) OR is_admin()));

drop policy if exists "profiles_select_own" on public."profiles";
create policy "profiles_select_own" on public."profiles" as PERMISSIVE for SELECT to authenticated
  using ((auth.uid() = id));

drop policy if exists "profiles_update_own" on public."profiles";
create policy "profiles_update_own" on public."profiles" as PERMISSIVE for UPDATE to authenticated
  using ((auth.uid() = id))
  with check ((auth.uid() = id));

drop policy if exists "program_access_select_own" on public."program_access";
create policy "program_access_select_own" on public."program_access" as PERMISSIVE for SELECT to authenticated
  using ((auth.uid() = id));

drop policy if exists "program_categories_admin_all" on public."program_categories";
create policy "program_categories_admin_all" on public."program_categories" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "program_categories_public_read" on public."program_categories";
create policy "program_categories_public_read" on public."program_categories" as PERMISSIVE for SELECT to anon,authenticated
  using (((is_active = true) OR is_admin()));

drop policy if exists "programs_select_active" on public."programs";
create policy "programs_select_active" on public."programs" as PERMISSIVE for SELECT to authenticated
  using ((is_active = true));

drop policy if exists "refund_requests insert own" on public."refund_requests";
create policy "refund_requests insert own" on public."refund_requests" as PERMISSIVE for INSERT to public
  with check ((auth.uid() = user_id));

drop policy if exists "refund_requests select own" on public."refund_requests";
create policy "refund_requests select own" on public."refund_requests" as PERMISSIVE for SELECT to public
  using ((auth.uid() = user_id));

drop policy if exists "refunds_admin_all" on public."refunds";
create policy "refunds_admin_all" on public."refunds" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "Admin can manage reviews" on public."reviews";
create policy "Admin can manage reviews" on public."reviews" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "Anyone can view active reviews" on public."reviews";
create policy "Anyone can view active reviews" on public."reviews" as PERMISSIVE for SELECT to anon,authenticated
  using ((is_active = true));

drop policy if exists "Admin can manage services" on public."services";
create policy "Admin can manage services" on public."services" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "Anyone can view active services" on public."services";
create policy "Anyone can view active services" on public."services" as PERMISSIVE for SELECT to anon,authenticated
  using ((is_active = true));

drop policy if exists "usage_status_admin_all" on public."usage_status";
create policy "usage_status_admin_all" on public."usage_status" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "authenticated can manage winning assessment knowledge" on public."winning_assessment_knowledge_items";
create policy "authenticated can manage winning assessment knowledge" on public."winning_assessment_knowledge_items" as PERMISSIVE for ALL to authenticated
  using (true)
  with check (true);

drop policy if exists "winning_base_data_admin_all" on public."winning_base_data";
create policy "winning_base_data_admin_all" on public."winning_base_data" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "winning_db_inputs_admin_all" on public."winning_db_inputs";
create policy "winning_db_inputs_admin_all" on public."winning_db_inputs" as PERMISSIVE for ALL to authenticated
  using (is_admin())
  with check (is_admin());
