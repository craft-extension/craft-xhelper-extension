import * as React from 'react'
import * as ReactDOM from 'react-dom'
import {
    ConfigProvider,
    Button,
    Form,
    message,
    notification,
    Switch,
} from 'antd';

import * as utils from './utils';
import {initMeta} from './config';

const layout = {
    labelCol: {span: 8},
    wrapperCol: {span: 16},
};

const App: React.FC<{}> = () => {
    const isDarkMode = useCraftDarkMode();
    const [forceToWechat, setForceToWechat] = React.useState(false);

    function useCraftDarkMode() {
        const [isDarkMode, setIsDarkMode] = React.useState(false);

        React.useEffect(() => {
            craft.env.setListener(env => setIsDarkMode(env.colorScheme === 'dark'));
        }, []);

        return isDarkMode;
    }

    React.useEffect(() => {
        if (isDarkMode) {
            // Note: 根据应用主题模式，适配 UI，各种颜色配置详见：https://ant-design.gitee.io/docs/react/customize-theme-variable-cn
            ConfigProvider.config({
                theme: {
                    primaryColor: '#202020',
                }
            });
        } else {
            ConfigProvider.config({
                theme: {
                    primaryColor: '#3bacd5',
                }
            });
        }
    }, [isDarkMode]);

    const [form] = Form.useForm();
    const onFinish = React.useCallback((sync) => {
        utils.syncToGithub(sync, forceToWechat)
    }, [forceToWechat]);

    const init = React.useCallback((type) => {
        // Note: 新建页面的时候，点击插入默认的 meta 信息到顶部
        craft.dataApi.getCurrentPage().then(result => {
            if (result.status !== 'success') {
                console.error('错误：获取页面内容失败');
                notification['error']({
                    message: '获取页面内容失败',
                    description: '无法获取当前页面内容，原因未知，可以在 Web 编辑器中加载该插件，如果仍然失败可以控制台查看相关信息'
                });
            } else {
                const data = result.data.subblocks;
                const metaTable = data.slice(0, 1)[0];
                if (metaTable.type !== 'tableBlock') {
                    // Note: 如果第一个元素不是 table，则插入一个
                    //  FIXME: craft 自带的 type 类型，blockFactory 还没有 table 类型，无语子
                    const table = (craft.blockFactory as any).tableBlock(initMeta(type));
                    const location = craft.location.indexLocation(result.data.id, 0);
                    craft.dataApi.addBlocks([table], location);
                } else {
                    message.error('第一个元素已经是 table 了，无需插入 meta！');
                }
            }
        });
    }, []);

    return (
        <Form {...layout} form={form}>
            <Button type="primary" htmlType="button" style={{margin: '8px 8px'}}
                onClick={onFinish.bind(null, true)}>
                发布
            </Button>
            <Button type="primary" htmlType="button" style={{margin: '8px 8px'}}
                onClick={onFinish.bind(null, false)}>
                Log
            </Button>
            <br />
            <Button type="primary" htmlType="button" onClick={() => init('tech')} style={{margin: '8px 8px'}}>
                技术-Init
            </Button>
            <Button type="primary" htmlType="button" onClick={() => init('life')} style={{margin: '8px 8px'}}>
                生活-Init
            </Button>
            <br />
            &nbsp;&nbsp;强推公众号草稿箱：
            <Switch checked={forceToWechat} checkedChildren="Y" unCheckedChildren="N" defaultChecked onChange={() => {
                setForceToWechat(!forceToWechat);
            }}/>
        </Form>
    );
}

export function initApp() {
    ReactDOM.render(<App/>, document.getElementById('react-root'))
}
