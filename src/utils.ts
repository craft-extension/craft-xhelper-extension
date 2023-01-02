// @ts-nocheck

import {
    notification,
    message,
} from 'antd';

import {Octokit} from "octokit";
import {TOKEN} from './secret'

Date.prototype.format = function(fmt) {
    var o = {
       "M+" : this.getMonth()+1,                 //月份
       "d+" : this.getDate(),                    //日
       "h+" : this.getHours(),                   //小时
       "m+" : this.getMinutes(),                 //分
       "s+" : this.getSeconds(),                 //秒
       "q+" : Math.floor((this.getMonth()+3)/3), //季度
       "S"  : this.getMilliseconds()             //毫秒
   };
   if(/(y+)/.test(fmt)) {
           fmt=fmt.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length));
   }
    for(var k in o) {
       if(new RegExp("("+ k +")").test(fmt)){
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length==1) ? (o[k]) : (("00"+ o[k]).substr((""+ o[k]).length)));
        }
    }
   return fmt;
}

const GITHUB_CONFIG = {
    owner: 'Xheldon',
    branch: 'master',
    ci_repo: 'craft_publish_ci',
    repo: 'x_blog_src',
    ci_path: 'content.md',
};

export const syncToGithub = (sync, forceToWechat = false) => {
    craft.dataApi.getCurrentPage().then(result => {
        if (result.status !== 'success') {
            // Note：获取页面内容失败
            console.error('错误: 获取页面内容失败');
            notification['error']({
                message: '获取页面内容失败',
                description: '无法获取当前页面内容，原因未知，可以在 Web 编辑器中加载该插件，如果仍然失败可以控制台查看相关信息'
            });
        } else {
            // Note: 第一个是 table，构建后发送
            console.log('---当前文档内容2:', result);
            const data = result.data.subblocks;
            const title = result.data.content[0].text;
            const coverImage = result.data.style?.coverImage;
            // let markdown = craft.markdown.craftBlockToMarkdown(result.data.subblocks.slice(1), 'common', {
            //     tableSupported: true,
            // })
            let markdown = data.slice(1).map(craftBlockToMarkdown).filter(Boolean).join('\n');
            let metaMarkdown = '';
            const metaTable: any = data.slice(0, 1)[0];
            let path = '';
            let cosPath = '';
            if (metaTable.type !== 'tableBlock') {
                message.error('第一个元素必须是 table 元素以提供必要信息如 path 等！');
                return;
            } else {
                metaTable.rows.forEach((row: any) => {
                    const left = (row.cells[0]?.block as any)?.content[0]?.text.trim();
                    // Note: 通过 API intiMeta 新建的有 block 字段（因为内容是 ''），直接手动新建的没有该字段，因此需要容错处理
                    const right = (row.cells[1]?.block as any)?.content[0]?.text.trim();
                    // Note: 如果 cell 为空，则 content 为空数组
                    if (!right || !left) {
                        return;
                    }
                    if (left === 'path') {
                        path = right;
                    }
                    if (left === 'cos') {
                        cosPath = right;
                    }
                    const isMultiLine: string[] = right.split('-:');
                    if (isMultiLine.length > 1) {
                        metaMarkdown += `${left}:\n`;
                        isMultiLine.filter(Boolean).forEach(tag => {
                            metaMarkdown += `    - ${tag.trim()}\n`;
                        });
                    } else {
                        metaMarkdown += `${(row.cells[0].block as any).content[0].text}: ${(row.cells[1].block as any).content[0].text}\n`;
                    }
                });
                if (metaMarkdown) {
                    metaMarkdown = '---\n' + metaMarkdown;
                    metaMarkdown += `title: ${title}\n`;
                    // Note: 如果 Craft 存在头图，需要将头图作为 header-img，如果是从 unsplash 获取的图片，则还需要带上版权信息，这些都可以通过 res.data.style.coverImage 得到
                    //  直接判断 url 中是否有值即可，无需判断 enable 的值
                    // Note：因为 title 是每次不会变化的，因此此处使用 title 作为 image 的名字
                    if (coverImage) {
                        const {url, attribution} = coverImage;
                        if (url) {
                            metaMarkdown += `header-img: ${url}\n`;
                        }
                        if (attribution) {
                            // Note: 从 unsplash 来的，图片地址包含了 url，需要提取出来
                            const [author, href] = attribution.split('||');
                            if (author) {
                                metaMarkdown += `header-img-credit: ${author}\n`;
                            }
                            if (href) {
                                // craft 的 link 是这样的：https://unsplash.com/@_miltiadis_?utm_source=craft_docs&utm_medium=referral，我也学他搞一个
                                metaMarkdown += `header-img-credit-href: ${href}?utm_source=xheldon_blog&utm_medium=referral\n`;
                            }
                        }
                    }
                }
            }
            
            // Note: 此处获取到 markdown，加上所有配置也齐全了，可以开始同步了
            // Note: 需要先发送获取该文件的请求，以检查该文件是否存在，如果存在，则需要提供该文件的 sha（在返回的结果中有该值）
            //  如果不存在则不需要该值
            let octokit = {};
            if (sync) {
                octokit = new Octokit({auth: TOKEN});
            }
            // Note: 先获取该地址，如果不存在则新建，如果存在则需要拿到该文件的 sha 值进行更新
            let content = '';
            if (metaMarkdown) {
                content = metaMarkdown + '---\n\n' + markdown;
            } else {
                content = markdown;
            }
            console.log('---当前文档内容:\n', content + '\n');
            if (!sync) {
                return;
            }
            // Note: 获取博客仓库的文件是否存在的信息，如果不存在则不需要传 sha 值
            octokit.rest.repos.getContent({
                owner: GITHUB_CONFIG.owner,
                repo: GITHUB_CONFIG.repo,
                path,
            }).then(result => {
                if (result.data && result.data.sha) {
                    message.error('文件存在，更新中...');
                    const lastUpdateTime = (new Date() as any).format('yyyy-MM-dd hh:mm:ss') + ' +0800';
                    console.log('更新时间:', lastUpdateTime);
                    if (metaMarkdown) {
                        content = metaMarkdown + `sha: ${result.data.sha}\n` + `lastUpdateTime: ${lastUpdateTime}\n---\n\n` + markdown;
                    }
                    console.log(`修改「${path}」：\n${content}`);
                    craft.editorApi.openURL(`xhelper://${forceToWechat ? 'FORCE_TO_WECHAT&' : ''}${btoa(unescape(encodeURIComponent(content)))}`)
                }
            })
            .catch(err => {
                if (err.status === 404) {
                    message.error('文件不存在，新建中...');
                    console.log(`新建「${path}」：\n${content}`);
                    // Note: 新建，直接推送到微信公众号
                    craft.editorApi.openURL(`xhelper://'FORCE_TO_WECHAT&${btoa(unescape(encodeURIComponent(content)))}`)
                }
            });
        }
    });
}

const inlineText = (content = []) => {
    return content.reduce((pre, curr) => {
        let result = '';
        // Note: 顺序影响嵌套规则
        if (curr.link) {
            result += '['
        }
        if (curr.isCode) {
            result += '`';
        }
        if (curr.isBold) {
            result += '**';
        }
        if (curr.isStrikethrough) {
            result += '~~';
        }
        if (curr.isItalic) {
            result += '*';
        }
        result += curr.text;
        // Note: 按顺序反着再来一遍
        if (curr.isItalic) {
            result += '*';
        }
        if (curr.isStrikethrough) {
            result += '~~';
        }
        if (curr.isBold) {
            result += '**';
        }
        if (curr.isCode) {
            result += '`';
        }
        if (curr.link) {
            result += `](${curr.link.url})`;
        }
        return `${pre}${result}`
    }, '') || ''
}

export const craftBlockToMarkdown = (block, key, blocks) => {
    // Note: 优先级最高的是缩进
    let indent = '';
    for (let i = 0; i < block.indentationLevel; i++) {
        indent += `    `;
    }
    switch (block.type) {
        case 'textBlock': {
            if (!block.content) {
                console.log(`第 ${key} 个块无内容！`)
                return;
            }
            // Note: title subtitle heading strong body caption 类型
            //  它们以 block.style.textStyle 区分
            // Note: page 类型 本身的 block.style.textStyle 为 page
            //  其 subblocks 也是一个 blocks 数组因此直接递归调用即可；card 同理
            // Note: 文本类型的加粗、斜体、下划线、行内代码，通过 block.content[x].isBold/isItalic/isStrikethrough/isCode: boolean 区分
            // Note: textBlock 的引用块通过 hasFocusDecoration/hasBlockDecoration 区分（craft markdown api 只将后者识别为 blockquote）
            // Note: 离谱的是，todo list 也是 textBlock
            //  其通过 block.listStyle.type: todo 区分，用 block.listStyle.state: checked/unchecked（取消？） 状态区分
            //  toggle 通过 block.listStyle.type: toggle 区分，无序列表值为 bullet 有序为 numbered
            //  list 的层级通过 block.indentationLevel 区分，默认是 0，缩进一次 +1
            //  textBlock 的 block.content 和  block.subblocks 可能是空
            //  居中之类的，markdown 不支持，当成最普通的 textBlock 即可，其通过 block.style.alignmentStyle: left center right 区分
            //  注：如果是引用块，list 的优先级比 blockquote 的优先级高，因此 craft 会将列表写包裹 blockquote： 1. > blockquote content 预期应该是 > 1. blockquote content 才对
            // Note: 优先判断 block 类型
            let symbol = '';
            if (block.listStyle?.type && block.listStyle.type !== 'none') {
                // Note: blockquote 内可能含 list
                let blockquote = '';
                if (block.hasBlockDecoration || block.hasFocusDecoration) {
                    blockquote = '> '
                }
                switch (block.listStyle?.type) {
                    case 'todo': {
                        symbol = block.listStyle.state === 'checked' ? '- [x] ' : '- [ ] ';
                        break;
                    }
                    case 'toggle': {
                        // Note: 我不用 toggle，虽然可以用 html 实现，但是不想
                        break;
                    }
                    case 'bullet': {
                        symbol = '* '
                        break;
                    }
                    case 'numbered': {
                        // Note: 可能有多个，但不管多少个，都用同一个 1 进行渲染
                        symbol = '1. ';
                    }
                }
                return indent + blockquote + symbol + inlineText(block.content) + '\n';
            }
            if (block.hasBlockDecoration || block.hasFocusDecoration) {
                return indent + `> ${inlineText(block.content)}\n`
            }
            // Note: 最后渲染为普通的 heading 文本块
            switch (block.style?.textStyle) {
                case 'title': {
                    return `${indent}# ${inlineText(block.content)}\n`;
                }
                case 'subtitle': {
                    return `${indent}## ${inlineText(block.content)}\n`;
                }
                case 'heading': {
                    return `${indent}### ${inlineText(block.content)}\n`;
                }
                case 'strong': {
                    return `${indent}#### ${inlineText(block.content)}\n`;
                }
                case 'body': {
                    return `${indent}${inlineText(block.content)}\n`;
                }
                case 'caption': {
                    return;
                }
                case 'page':
                case 'card': {
                    return `${indent}${inlineText(block.content)}\n\n${block.subblocks?.map(craftBlockToMarkdown).filter(Boolean).join('\n')}`;
                }
            }
        }
        case 'horizontalLineBlock': {
            // Note: 分隔线，通过 block.lineStyle 区分不同样式，值为：extraLight light regular strong
            return '---\n' 
        }
        case 'tableBlock': {
            // Note: 表格就直接用 api 生成好了，craft 也不支持在表格里面放过多 block
            return craft.markdown.craftBlockToMarkdown([block], 'common', {
                tableSupported: true,
            }) + '\n';
        }
        case 'imageBlock': {
            // Note: 引用的 unsplash 图片，通过 block.url 访问地址，自己上传的一样。区别是 block.previewUrl 前者没值，后者有
            const next = blocks[key + 1];
            if (next?.style?.textStyle === 'caption' && next.content[0]?.text) {
                return `{% render_caption caption="${next.content[0]?.text}" img="${block.url}" %}\n![${next.content[0]?.text}](${block.url})\n{% endrender_caption %}\n`
            }
            if (block.filename) {
                // Note: 此时 filename 可能带后缀，去掉一下
                let filename = block.filename;
                let arr = filename.split('.');
                if (arr.length > 1) {
                    filename = arr.slice(0, arr.length - 1).join('');
                }
                return `{% render_caption caption="${filename}" img="${block.url}" %}\n![${filename}](${block.url})\n{% endrender_caption %}\n`
            } else {
                return `![${block.filename || 'Image'}](${block.url})\n`;
            }
        }
        case 'urlBlock': {
            // Note: 将其渲染成 jekyll 自定义标签内容，然后通过自定义插件，构建类似于 Craft、Notion 的 bookmark 的效果
            // youtube 和 bilibili 链接支持
            let url = new URL(block.url);
            let yid = '';
            let bid = '';
            if (url.hostname === 'www.youtube.com') {
                for (let i of url.searchParams) {
                    if (i[0] === 'v') {
                        yid = i[1];
                    }
                }
            } else if (url.hostname === 'www.bilibili.com') {
                bid = url.pathname.split('/').filter(Boolean)[1];
            }
            return `{% render_bookmark url="${block.url}" title="${block.title || ''}" img="${block.imageUrl || ''}" yid="${yid}" bid="${bid}" %}\n${block.pageDescription || ''}\n{% endrender_bookmark %}\n`;
        }
        case 'codeBlock': {
            // Note: 代码块，通过 block.code 为其内容，block.language 为语言
            // Note: 公式也是该类型，通过 block.language: math_formula 区分
            if (block.language === 'math_formula') {
                // Note: markdown 不支持公式
            }
            return indent + `\`\`\`${block.language}\n${indent}${block.code}\n${indent}\`\`\`\n`;
        }
        case 'fileBlock': {
            // 文件不支持
            return ''
        }
        case 'videoBlock': {
            if (block.filename) {
                let filename = block.filename;
                let suffix = '';
                let arr = filename.split('.');
                if (arr.length > 1) {
                    filename = arr.slice(0, arr.length - 1).join('');
                    suffix = arr[arr.length - 1];
                }
                return `{% render_video caption="${filename}" img="${block.url}" suffix="${suffix}" %}\n![${filename}](${block.url})\n{% endrender_video %}\n`
            }
        }
    };
};
