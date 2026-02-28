import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdmin } from '@/lib/auth';

const serverSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

export async function DELETE(request) {
  const url = new URL(request.url);
  const roomId = url.searchParams.get('id');
  if (!roomId) {
    return NextResponse.json({ error: '缺少房间ID' }, { status: 400 });
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const supabase = serverSupabase();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(token);

  if (authErr || !user) {
    return NextResponse.json({ error: '身份验证失败' }, { status: 401 });
  }
  if (!isAdmin(user)) {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
