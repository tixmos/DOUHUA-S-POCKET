/* 豆花的口袋 —— 线上后台配置

   把下面两个值换成你自己的，网站在【线上实时后台】模式下运行：

     url     ：Supabase 后台 → Project Settings → API → Project URL
               形如 https://abcdefghijklmn.supabase.co
     anonKey ：同一个页面上的 anon public 那一长串
               （这是专门给前端用的公开 key，放在网页里是正常做法，
                 真正的写权限由"登录"把关，陌生人没有账号就改不了）

   两个值都留空的话，网站会退回原来的模式：
   读本地草稿 / content.js，你改完导出再上传。功能完全不受影响。 */

window.DH_SUPABASE = {
  url: 'https://hipdufhwebiagwcvldpx.supabase.co',
  anonKey: 'sb_publishable_G3ktA4q9ko9GnMf_nu0IMQ_aFZpxfKO'
};
