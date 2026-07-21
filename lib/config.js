/**
 * 配置文件 - 源地址和 Spider 设置
 */

export const SOURCES = [
  'https://cdn.jsdelivr.net/gh/2hacc/TVBox@main/oktv.json',
  'https://raw.githubusercontent.com/qist/tvbox/refs/heads/master/jsm.json',
  'https://raw.githubusercontent.com/gaotianliuyun/gao/master/js.json',
  'https://raw.liucn.cc/box/m.json'
];

export const SPIDER = 'https://cdn.jsdelivr.net/gh/2hacc/TVBox@main/jar/tvbox.txt;md5;265301f463ec681dcbba91897f20f08b';

// 网盘类关键词排除
export const PAN_KEYWORDS = /网盘|云盘|Ali|Quark|Thunder|PikPak|UCShare|Samba|115|Push|AList|WebDAV|MIPanSo|KkSs|PanS|YiSo|YpanSo|UuSs|xzso|盘搜|盘他|米盘|抠抠|夸搜|易搜|盘Se|夸克|阿里|PanWeb|Share|分享|云搜|紙條|纸条|Gitcafe|Dovx|Zhaozy|UpYun|弹幕|磁力|p2p/i;
