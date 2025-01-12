import plugin from '../../lib/plugins/plugin.js';
import { createRequire } from 'module';
import fetch from 'node-fetch';
import net from 'net';
import fs from 'fs';
import YAML from 'yaml';

const require = createRequire(import.meta.url);
const { exec } = require('child_process');

const isPortTaken = async (port) => {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => tester.once('close', () => resolve(false)).close())
      .listen(port);
  });
};

export class Restart extends plugin {
  constructor(e = '') {
    super({
      name: '重启',
      dsc: '#重启',
      event: 'message',
      priority: 10,
      rule: [{
        reg: '^#重启$',
        fnc: 'restart',
        permission: 'master'
      }, {
        reg: '^#(停机|关机)$',
        fnc: 'stop',
        permission: 'master'
      }]
    });

    if (e) this.e = e;

    this.key = 'Yz:restart';
  }

  async init() {
    let restart = await redis.get(this.key);
    if (restart) {
      restart = JSON.parse(restart);
      const uin = restart?.uin || Bot.uin;
      let time = restart.time || new Date().getTime();
      time = (new Date().getTime() - time) / 1000;

      let msg = `重启成功：耗时${time.toFixed(2)}秒`;
      try {
        if (restart.isGroup) {
          Bot[uin].pickGroup(restart.id).sendMsg(msg);
        } else {
          Bot[uin].pickUser(restart.id).sendMsg(msg);
        }
      } catch (error) {
        logger.debug(error);
      }
      redis.del(this.key);
    }
  }

  async restart() {
    let restart_port;
    try {
      restart_port = YAML.parse(fs.readFileSync(`./config/config/bot.yaml`, `utf-8`));
      restart_port = restart_port.restart_port || 27881;
    } catch {}

    await this.e.reply('开始执行重启，请稍等...');
    logger.mark(`${this.e.logFnc} 开始执行重启，请稍等...`);

    let data = JSON.stringify({
      uin: this.e?.self_id || this.e.bot.uin,
      isGroup: !!this.e.isGroup,
      id: this.e.isGroup ? this.e.group_id : this.e.user_id,
      time: new Date().getTime()
    });

    let npm = await this.checkPnpm();
    logger.mark(`选择的包管理工具: ${npm}`);
    await redis.set(this.key, data, { EX: 120 });

    if (await isPortTaken(restart_port || 27881)) {
      try {
        let result = await fetch(`http://localhost:${restart_port || 27881}/restart`);
        result = await result.text();
        if (result !== `OK`) {
          redis.del(this.key);
          this.e.reply(`操作失败！`);
          logger.error(`重启失败`);
        }
      } catch (error) {
        redis.del(this.key);
        this.e.reply(`操作失败！\n${error}`);
      }
    } else {
      try {
        let cm = `${npm} start`;
        if (process.argv[1].includes('pm2')) {
          cm = `${npm} run restart`;
        }

        exec(cm, { windowsHide: true }, (error, stdout, stderr) => {
          if (error) {
            redis.del(this.key);
            this.e.reply(`操作失败！\n包管理工具: ${npm}\nError: ${error.stack}`);
            logger.error(`重启失败\nCommand: ${cm}\nError: ${error.stack}`);
          } else {
            logger.mark('重启成功，运行已由前台转为后台');
            logger.mark(`查看日志请用命令：${npm} run log`);
            logger.mark(`停止后台运行命令：${npm} stop`);
            process.exit();
          }
        });
      } catch (error) {
        redis.del(this.key);
        this.e.reply(`操作失败！\n${error.stack}`);
      }
    }

    return true;
  }

  async checkPnpm() {
    let npm = 'npm'; // 默认使用 npm

    // 检查 yarn 是否可用
    let yarnCheck = await this.execSync('yarn -v');
    if (yarnCheck.stdout) {
      return 'yarn'; // 如果 yarn 可用，则优先使用 yarn
    }

    // 检查 pnpm 是否可用
    let pnpmCheck = await this.execSync('pnpm -v');
    if (pnpmCheck.stdout) {
      return 'pnpm'; // 如果 pnpm 可用，则使用 pnpm
    }

    // 默认返回 npm
    return npm;
  }

  async execSync(cmd) {
    return new Promise((resolve) => {
      exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
        resolve({ error, stdout, stderr });
      });
    });
  }

  async stop() {
    let restart_port;
    try {
      restart_port = YAML.parse(fs.readFileSync(`./config/config/bot.yaml`, `utf-8`));
      restart_port = restart_port.restart_port || 27881;
    } catch {}

    if (await isPortTaken(restart_port || 27881)) {
      try {
        logger.mark('关机成功，已停止运行');
        await this.e.reply(`关机成功，已停止运行`);
        await fetch(`http://localhost:${restart_port || 27881}/exit`);
        return;
      } catch (error) {
        this.e.reply(`操作失败！\n${error}`);
        logger.error(`关机失败\n${error}`);
      }
    }

    if (!process.argv[1].includes('pm2')) {
      logger.mark('关机成功，已停止运行');
      await this.e.reply('关机成功，已停止运行');
      process.exit();
    }

    logger.mark('关机成功，已停止运行');
    await this.e.reply('关机成功，已停止运行');

    let npm = await this.checkPnpm();
    exec(`${npm} stop`, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        this.e.reply(`操作失败！\n${error.stack}`);
        logger.error(`关机失败\n${error.stack}`);
      }
    });
  }
}
