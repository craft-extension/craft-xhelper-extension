// @ts-nocheck
import {initApp} from './app';
import './style.css';
// Note: 增加动态调整主题的能力
import 'antd/dist/antd.variable.min.css';
import * as VConsole from 'vconsole'

const vConsole = new VConsole();

craft.env.setListener(env => {
    console.log('env:', env); // <--- here, env is nothing
    setTimeout(() => {
        console.log('env2:', env);
        initApp()
    }, 2000);
    // if (env.platform === 'Mac') {
    //     // Note: Mac has bug --- it's exist long time: you can't read localstorage at the first, must need waiting.
        
    // } else {
    //     initApp();
    // }
});