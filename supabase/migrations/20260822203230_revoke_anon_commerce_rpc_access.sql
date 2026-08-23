revoke execute on function public.check_discount_code(text,text,numeric) from anon;
revoke execute on function public.record_discount_redemption(text,uuid,numeric) from anon;
revoke execute on function public.check_gift_card(text,text) from anon;
revoke execute on function public.redeem_gift_card(text,uuid,numeric) from anon;
revoke execute on function public.convert_loyalty_points(integer) from anon;
revoke all on function public.increment_discount_usage(text) from public, anon, authenticated;
grant execute on function public.increment_discount_usage(text) to service_role;
