// ==UserScript==
// @name         哔哩哔哩(B站|Bilibili)收藏夹Fix
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  修复 哔哩哔哩(www.bilibili.com) 失效的收藏。（可查看av号、简介、标题、封面）
// @author       Mr.Po
// @match        https://space.bilibili.com/*
// @require      http://code.jquery.com/jquery-1.11.0.min.js
// @resource iconError https://raw.githubusercontent.com/Mr-Po/bilibili-favorites-fix/master/media/error.png
// @resource iconSuccess https://raw.githubusercontent.com/Mr-Po/bilibili-favorites-fix/master/media/success.png
// @resource iconInfo https://raw.githubusercontent.com/Mr-Po/bilibili-favorites-fix/master/media/info.png
// @connect      biliplus.com
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setClipboard
// @grant        GM_getResourceURL
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 失效收藏标题颜色(默认为灰色)
     * @type {String}
     */
    var invalTitleColor = "#999";

    /**
     * 是否启用调试模式
     * 启用后，浏览器控制台会显示此脚本运行时的调试数据
     * @type {Boolean}
     */
    var isDebug = false;

    /**
     * 重试延迟[秒]
     * @type {Number}
     */
    var retryDelay = 5;

    /**
     * 每隔 space 毫秒检查一次，是否有新的微博被加载出来
     * 此值越小，检查越快；过小会造成浏览器卡顿
     * @type {Number}
     */
    var space = 2000;

    /**
     * 收藏夹地址正则
     * @type {RegExp}
     */
    var favlistRegex = /https:\/\/space\.bilibili\.com\/\d+\/favlist.*/;

    // 修改收藏
    function updateFav() {

        var flag = favlistRegex.test(window.location.href);

        //console.log(flag);

        if (flag) {

            var $lis = $("ul.fav-video-list.content li.small-item.disabled");

            if ($lis.size() > 0) {

                console.info($lis.size() + "个收藏待修复...");

                $lis.each(function(i, it) {

                    var aid = $(it).attr("data-aid");
                    var $as = $(it).find("a");

                    $as.attr("href", "https://www.biliplus.com/video/av" + aid + "/");
                    $as.attr("target", "_blank");

                    addCopyAVCodeButton($(it), aid);

                    fixTitleAndPic($(it), $($as[1]), aid);

                    $(it).removeClass("disabled");
                    $as.removeClass("disabled");
                });

                showDetail($lis);
            }
        }
    }

    function addOperation($item, name, fun) {

        var $ul = $item.find(".be-dropdown-menu").first();

        var lastChild = $ul.children().last();

        // 未添加过扩展
        if (!lastChild.hasClass('be-dropdown-item-extend')) {
            lastChild.addClass("be-dropdown-item-delimiter");
        }

        var $li = $("<li class=\"be-dropdown-item be-dropdown-item-extend\">" + name + "</li>");

        $li.click(fun);

        $ul.append($li);
    }

    function addCopyAVCodeButton($item, aid) {

        addOperation($item, "复制av号", function() {

            GM_setClipboard("av" + aid, "text");

            tipSuccess("av号复制成功！");
        });
    }

    function addCopyInfoButton($item, content) {

        addOperation($item, "复制简介", function() {

            GM_setClipboard(content, "text");

            tipSuccess("简介复制成功！");
        });
    }

    // 标记失效
    function signInval($it, $a) {

        // 收藏时间
        var $pubdate = $it.find("div.meta.pubdate");
        $pubdate.attr("style", "text-decoration:line-through");

        $a.attr("style", "text-decoration:line-through;color:" + invalTitleColor + ";");
    }

    // 绑定重新加载
    function bindReload($a, fun) {

        $a.text("->手动加载<-");

        $a.click(function() {

            $(this).unbind("click");

            $a.text("Loading...");

            fun();
        });
    }

    // 再次尝试加载
    function retryLoad($a, aid, retry, fun) {

        console.warn("查询：av" + aid + "，请求过快！");

        if (retry) { // 手动重试

            $a.text("请求过快，请稍后[" + retryDelay + "]s再试！");

            setTimeout(bindReload, retryDelay * 1000, $a, fun);

            countdown($a, retryDelay);

        } else { // 首次

            $a.attr("href", "javascript:void(0);");

            bindReload($a, fun);
        }
    }

    // 加载倒计时
    function countdown($a, second) {

        if ($a.text().indexOf("请求过快") === 0) {

            $a.text("请求过快，请稍后[" + second + "]s再试！");

            if (second > 1) {
                setTimeout(countdown, 1000, $a, second - 1);
            }
        }
    }

    // 修复成功
    function fixSuccess($it, $a, aid, title, pic, history) {

        // 设置标题
        $a.text(title);
        $a.attr("title", $a.text());

        var $as = $it.find("a");
        $as.attr("href", "https://www.biliplus.com/" + history + "video/av" + aid + "/");

        signInval($it, $a);

        isLoad(pic, function() {
            var $img = $it.find("img");
            $img.attr("src", pic);
        });
    }

    // 修复标题和海报
    function fixTitleAndPic($it, $a, aid) {

        if (isDebug) {
            console.log("fixTitleAndPic");
        }

        $a.text("Loading...");

        fixTitleAndPicEnhance3($it, $a, aid);
    }

    // 修复标题和海报 增强 - 0
    function fixTitleAndPicEnhance0($it, $a, aid, retry) {

        if (isDebug) {
            console.log("fixTitleAndPicEnhance0");
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: "https://www.biliplus.com/api/view?id=" + aid,
            responseType: "json",
            onload: function(response) {

                var res = response.response;

                if (isDebug) {
                    console.log("0---->：");
                    console.log(res);
                }

                // 找到了
                if (res.title) {

                    fixSuccess($it, $a, aid, res.title, res.pic, "");

                } else if (res.code == -503) { // 请求过快

                    retryLoad($a, aid, retry, function() {
                        fixTitleAndPicEnhance0($it, $a, aid, true);
                    });

                } else { // 未找到

                    fixTitleAndPicEnhance1($it, $a, aid);
                }
            },
            onerror: function(e) {
                console.log("出错啦");
                console.log(e);
            }
        });
    }

    // 修复标题和海报 增强 - 1
    function fixTitleAndPicEnhance1($it, $a, aid) {

        if (isDebug) {
            console.log("fixTitleAndPicEnhance1");
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: "https://www.biliplus.com/all/video/av" + aid + "/",
            onload: function(response) {

                //console.log("1---->："+response.responseText);

                var params = response.responseText.match(/getjson\('(\/api\/view_all.+)'/);

                fixTitleAndPicEnhance2($it, $a, aid, params[1]);
            }
        });
    }

    // 修复标题和海报 增强 - 2
    function fixTitleAndPicEnhance2($it, $a, aid, param, retry) {

        if (isDebug) {
            console.log("fixTitleAndPicEnhance2");
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: "https://www.biliplus.com" + param,
            responseType: "json",
            onload: function(response) {

                var res = response.response;

                if (isDebug) {
                    console.log("2---->：");
                    console.log(res);
                }

                // 找到了
                if (res.code === 0) {

                    fixSuccess($it, $a, aid, res.data.info.title, res.data.info.pic, "all/");

                } else if (res.code == -503) { // 请求过快

                    retryLoad($a, aid, retry, function() {
                        fixTitleAndPicEnhance2($it, $a, aid, param, true);
                    });

                } else { // 未找到

                    $a.text("已失效（" + aid + "）");
                    $a.attr("title", $a.text());
                }
            }
        });
    }

    // 修复标题和海报 增强 - 3
    function fixTitleAndPicEnhance3($it, $a, aid) {

        if (isDebug) {
            console.log("fixTitleAndPicEnhance3");
        }

        var jsonRegex;

        GM_xmlhttpRequest({
            method: 'GET',
            url: "https://www.biliplus.com/video/av" + aid + "/",
            onload: function(response) {

                try {

                    if (isDebug) {
                        console.log("3---->：" + response.responseText);
                    }

                    jsonRegex = response.responseText.match(/window\.addEventListener\('DOMContentLoaded',function\(\){view\((.+)\);}\);/);

                    if (isDebug) {
                        console.log(jsonRegex);
                    }

                    var jsonStr = jsonRegex[1];

                    if (isDebug) {
                        console.log(jsonStr);
                    }

                    var res = $.parseJSON(jsonStr);

                    if (res.title) { // 存在

                        fixSuccess($it, $a, aid, res.title, res.pic, "");

                    } else if (res.code == -503) { // 请求过快

                        retryLoad($a, aid, null, function() {
                            fixTitleAndPicEnhance0($it, $a, aid, true);
                        });

                    } else { // 不存在

                        fixTitleAndPicEnhance1($it, $a, aid);
                    }

                } catch (err) {

                    console.error(err);
                    console.log(jsonRegex);

                    // 当出现错误时，出现手动加载
                    retryLoad($a, aid, null, function() {
                        fixTitleAndPicEnhance0($it, $a, aid, true);
                    });
                }
            }
        });
    }

    // 判断一个url是否可以访问
    function isLoad(url, fun) {
        $.ajax({
            url: url,
            type: 'GET',
            success: function(response) {
                fun();
            },
            error: function(e) {}
        });
    }

    // 显示详细
    function showDetail($lis) {

        var fidRegex = window.location.href.match(/fid=(\d+)/);

        var fid;

        if (fidRegex) {
            fid = fidRegex[1];
        } else {
            fid = $("div.fav-item.cur").attr("fid");
        }

        var pn = $("ul.be-pager li.be-pager-item.be-pager-item-active").text();

        $.ajax({
            url: "https://api.bilibili.com/medialist/gateway/base/spaceDetail?media_id=" + fid + "&pn=" + pn + "&ps=20&keyword=&order=mtime&type=0&tid=0&jsonp=jsonp",
            success: function(json) {

                var $medias = json.data.medias;

                $lis.each(function(i, it) {

                    var aid = $(it).attr("data-aid");

                    var $mediaF = $medias.filter(function(it) {
                        if (it.id == aid) {
                            return it;
                        }
                    });

                    var $media = $mediaF[0];

                    var $a = $(it).find("a");

                    var titles = "";

                    if ($media.pages) {

                        var $titlesM = $media.pages.map(function(it, i, arry) {
                            return it.title;
                        });

                        titles = $titlesM.join("、");
                    }

                    var content = "av：" + aid + "\nP数：" + $media.page + "\n子P：" + titles + "\n简介：" + $media.intro;

                    $($a[0]).attr("title", content);

                    addCopyInfoButton($(it), content);
                });
            }
        });
    }

    function tip(text, iconName) {
        GM_notification({
            text: text,
            image: GM_getResourceURL(iconName)
        });
    }

    function tipInfo(text) {
        tip(text, "iconInfo");
    }

    function tipError(text) {
        tip(text, "iconError");
    }

    function tipSuccess(text) {
        tip(text, "iconSuccess");
    }

    setInterval(updateFav, space);
})();