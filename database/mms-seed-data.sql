--
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: country_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.country_codes (id, code, iso, flag, name, is_active, sort_order) FROM stdin;
1	+974	QA	🇶🇦	Qatar	t	0
2	+971	AE	🇦🇪	UAE	t	1
3	+966	SA	🇸🇦	Saudi Arabia	t	2
4	+965	KW	🇰🇼	Kuwait	t	3
5	+973	BH	🇧🇭	Bahrain	t	4
6	+968	OM	🇴🇲	Oman	t	5
7	+20	EG	🇪🇬	Egypt	t	10
8	+91	IN	🇮🇳	India	t	11
9	+92	PK	🇵🇰	Pakistan	t	12
10	+880	BD	🇧🇩	Bangladesh	t	13
11	+63	PH	🇵🇭	Philippines	t	14
12	+94	LK	🇱🇰	Sri Lanka	t	15
13	+977	NP	🇳🇵	Nepal	t	16
14	+1	US	🇺🇸	United States	t	20
15	+44	GB	🇬🇧	United Kingdom	t	21
\.


--
-- Data for Name: credit_groups; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.credit_groups (id, name, credit_limit, created_at, updated_at, max_days, default_payment_terms) FROM stdin;
d3e4c8fc-7c8b-40cd-ae92-e779faf2995c	Standard	10000	2026-05-11 14:04:14.334465+00	2026-06-29 09:35:10.994138+00	60	Net 60
\.


--
-- Data for Name: payment_methods; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payment_methods (id, name, slug, is_active, sort_order, created_at, requires_payment_link) FROM stdin;
78550d7b-9c8e-47c0-8ecf-96d972085d08	Cash	cash	t	1	2026-05-24 08:16:54.313922+00	f
9beadb36-7e0d-436e-bb24-59fe0a096fa4	Bank Transfer	bank_transfer	t	3	2026-05-24 08:16:54.313922+00	f
69dd5cd0-9a67-480a-8d60-578501b5b888	PDC	pdc	t	4	2026-05-24 08:16:54.313922+00	f
5f8a6f87-206a-43fe-a63d-884209f2211a	CDC	cdc	t	5	2026-05-24 08:16:54.313922+00	f
76228be0-bdc3-46ee-a7cf-3ab811e03d6e	Pay Later	pay_later	t	7	2026-05-24 08:16:54.313922+00	f
598dfc60-01b9-4fd1-8f2f-3c5da13e5265	Online Payment	online_payment	t	2	2026-05-24 08:16:54.313922+00	t
3b87fe65-58f6-447a-8917-d9fa30445386	Point of Sale	point_of_sale	t	6	2026-05-24 08:16:54.313922+00	f
\.


--
-- Data for Name: credit_group_payment_methods; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.credit_group_payment_methods (credit_group_id, payment_method_id, created_at) FROM stdin;
d3e4c8fc-7c8b-40cd-ae92-e779faf2995c	5f8a6f87-206a-43fe-a63d-884209f2211a	2026-06-29 09:41:30.388862+00
d3e4c8fc-7c8b-40cd-ae92-e779faf2995c	9beadb36-7e0d-436e-bb24-59fe0a096fa4	2026-06-29 09:41:30.388862+00
d3e4c8fc-7c8b-40cd-ae92-e779faf2995c	3b87fe65-58f6-447a-8917-d9fa30445386	2026-06-29 09:41:30.388862+00
\.


--
-- Data for Name: currencies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) FROM stdin;
b424928f-304f-4992-a632-79f7ca7edcd4	QAR	Qatari Riyal	﷼	t	1	2026-06-01 08:14:44.034437+00	2026-06-01 08:14:44.034437+00
442752c4-c47e-46ef-b04a-75e0e743441d	USD	US Dollar	$	t	2	2026-06-01 08:14:44.034437+00	2026-06-01 08:14:44.034437+00
342ea382-4ea7-4191-b707-30eecb596336	EUR	Euro	€	t	3	2026-06-01 08:14:44.034437+00	2026-06-01 08:14:44.034437+00
a2d3503c-9072-42e7-8720-f23258bf9b7d	GBP	British Pound	£	t	4	2026-06-01 08:14:44.034437+00	2026-06-01 08:14:44.034437+00
11f6f4e1-a447-4cee-80d1-d94f359f1d54	SAR	Saudi Riyal	﷼	t	5	2026-06-01 08:14:44.034437+00	2026-06-01 08:14:44.034437+00
6516e1df-577d-4c44-a25c-916958b05990	AED	UAE Dirham	د.إ	t	6	2026-06-01 08:14:44.034437+00	2026-06-01 08:14:44.034437+00
0fa10c6e-74a4-4264-b732-4a894866d346	KWD	Kuwaiti Dinar	د.ك	t	7	2026-06-01 08:14:44.034437+00	2026-06-01 08:14:44.034437+00
419589bf-b67e-4af1-96aa-c09884fe8427	BHD	Bahraini Dinar	BD	t	8	2026-06-01 08:14:44.034437+00	2026-06-01 08:14:44.034437+00
24a2113f-c8f5-4699-ae29-50d487415397	OMR	Omani Rial	﷼	t	9	2026-06-01 08:14:44.034437+00	2026-06-01 08:14:44.034437+00
da821f51-5e13-46cc-b9e1-dff62a054c51	INR	Indian Rupee	₹	t	10	2026-06-01 08:14:44.034437+00	2026-06-01 08:14:44.034437+00
491b0f81-985d-4a87-9c05-baffbdc2dd93	CNY	Chinese Yuan	¥	t	11	2026-06-01 08:14:44.034437+00	2026-06-01 08:14:44.034437+00
c2b62029-639d-4ed8-9311-e85a8dafc344	JPY	Japanese Yen	¥	t	12	2026-06-01 08:14:44.034437+00	2026-06-01 08:14:44.034437+00
\.


--
-- Data for Name: reason_list_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reason_list_categories (id, slug, label, sort_order, active, deleted_at, created_at) FROM stdin;
f96a8c52-784b-404b-acfd-a231a811619b	cancellation	Cancellation	10	t	\N	2026-06-27 14:43:52.716657+00
aaf6be7a-4263-4a75-a581-1fbc34ce9a48	return	Return	20	t	\N	2026-06-27 14:43:52.716657+00
ca01bcf9-38c4-4cb6-a9b6-948921404a90	adjustment	Adjustment	30	t	\N	2026-06-27 14:43:52.716657+00
167df497-f2a7-461d-add7-fa720d49f830	credit_note	Credit Note	40	t	\N	2026-06-27 14:43:52.716657+00
8db383fc-1694-4dac-a239-115e70a78727	refund	Refund	50	t	\N	2026-06-27 14:43:52.716657+00
25eb4036-6daa-4944-a81f-0cf69a35a6f1	discount	Discount	60	t	\N	2026-06-27 14:43:52.716657+00
3a41429f-ba00-458e-bb59-ce790df62089	complaint	Complaint	70	t	\N	2026-06-27 14:43:52.716657+00
d53f7fa6-291e-4b2a-b309-f512becaf637	reschedule	Reschedule	80	t	\N	2026-06-27 14:43:52.716657+00
c7513930-c88e-4355-9448-ef43514037a7	void	Void	90	t	\N	2026-06-27 14:43:52.716657+00
d27deb54-47cc-4ebb-8dfe-a27ce530f79e	sale_return	Sale Return	25	t	\N	2026-07-02 17:18:41.094544+00
fb51aee7-5897-4884-895d-dc9e017b683f	po_return	PO Return	26	t	\N	2026-07-02 17:18:41.094544+00
\.


--
-- Name: country_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.country_codes_id_seq', 15, true);


--
-- PostgreSQL database dump complete
--


