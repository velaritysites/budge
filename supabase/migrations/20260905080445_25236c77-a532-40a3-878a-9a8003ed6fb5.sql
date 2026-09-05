REVOKE ALL ON FUNCTION public.refresh_spending_benchmarks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_household_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shares_household_with(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_spending_benchmarks() TO service_role;