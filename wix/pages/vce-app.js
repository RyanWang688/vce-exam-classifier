// Velo 页面代码：放到“题库”页面的 Page Code。页面上只有一个 HTML 组件，ID 设为 vceApp，代码粘贴 wix/html/loader.html。
// 这一页要设为“仅会员可见”，老师登录后才能打开；后端还会再检查老师角色。
import * as backend from 'backend/vce.web';
import { connectVceApp } from 'public/vceHost';

$w.onReady(() => {
  connectVceApp($w('#vceApp'), backend);
});
