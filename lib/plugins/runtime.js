/**
 * plugin的runtime，可通过e.runtime访问
 *
 * 提供一些常用的运行时变量、方法及model获取
 * 降低对目录结构的依赖
 */
import lodash from "lodash"
import fs from "node:fs/promises"
import common from "../common/common.js"
import cfg from "../config/config.js"
import puppeteer from "../puppeteer/puppeteer.js"
import Handler from "./handler.js"

let gsCfg, MysApi, MysInfo, NoteUser, MysUser, Version
try {
  gsCfg = (await import("../../plugins/genshin/model/gsCfg.js")).default
  MysApi = (await import("../../plugins/genshin/model/mys/mysApi.js")).default
  MysInfo = (await import("../../plugins/genshin/model/mys/mysInfo.js")).default
  NoteUser = (await import("../../plugins/genshin/model/mys/NoteUser.js")).default
  MysUser = (await import("../../plugins/genshin/model/mys/MysUser.js")).default
} catch {}
try {
  Version = (await import("#miao")).Version
} catch {}

/**
 * 常用的处理方法
 */

export default class Runtime {
  constructor(e) {
    this.e = e
    this._mysInfo = {}

    this.handler = {
      has: Handler.has,
      call: Handler.call,
      callAll: Handler.callAll,
    }
  }

  get uid() {
    return this.user?.uid
  }

  get hasCk() {
    return this.user?.hasCk
  }

  get user() {
    return this.e.user
  }

  get cfg() {
    return cfg
  }

  get gsCfg() {
    return gsCfg
  }

  get common() {
    return common
  }

  get puppeteer() {
    return puppeteer
  }

  get MysInfo() {
    return MysInfo
  }

  get NoteUser() {
    return NoteUser
  }

  get MysUser() {
    return MysUser
  }

  async initUser() {
    let e = this.e
    let user = await NoteUser.create(e)
    if (user) {
      e.user = new Proxy(user, {
        get(self, key, receiver) {
          let game = e.game
          let fnMap = {
            uid: "getUid",
            uidList: "getUidList",
            mysUser: "getMysUser",
            ckUidList: "getCkUidList",
          }
          if (fnMap[key]) {
            return self[fnMap[key]](game)
          }
          if (key === "uidData") {
            return self.getUidData("", game)
          }
          if (
            [
              "getUid",
              "getUidList",
              "getMysUser",
              "getCkUidList",
              "getUidMapList",
              "getGameDs",
            ].includes(key)
          ) {
            return (_game, arg2) => {
              return self[key](_game || game, arg2)
            }
          }
          if (["getUidData", "hasUid", "addRegUid", "delRegUid", "setMainUid"].includes(key)) {
            return (uid, _game = "") => {
              return self[key](uid, _game || game)
            }
          }
          return self[key]
        },
      })
    }
  }

  /**
   * 获取MysInfo实例
   *
   * @param targetType all: 所有用户均可， cookie：查询用户必须具备Cookie
   * @returns {Promise<boolean|MysInfo>}
   */
  async getMysInfo(targetType = "all") {
    if (!this._mysInfo[targetType]) {
      this._mysInfo[targetType] = await MysInfo.init(
        this.e,
        targetType === "cookie" ? "detail" : "roleIndex",
      )
    }
    return this._mysInfo[targetType]
  }

  async getUid() {
    return await MysInfo.getUid(this.e)
  }

  /**
   * 获取MysApi实例
   *
   * @param targetType all: 所有用户均可， cookie：查询用户必须具备Cookie
   * @param option MysApi option
   * @param isSr 是否为星穹铁道
   * @returns {Promise<boolean|MysApi>}
   */
  async getMysApi(targetType = "all", option = {}, isSr = false) {
    let mys = await this.getMysInfo(targetType)
    if (mys.uid && mys?.ckInfo?.ck) {
      if (isSr) option.game = "sr"
      return new MysApi(mys.uid, mys.ckInfo.ck, option)
    }
    return false
  }

  /**
   * 生成MysApi实例
   * @param uid
   * @param ck
   * @param option
   * @param isSr 是否为星穹铁道
   * @returns {MysApi}
   */
  createMysApi(uid, ck, option, isSr = false) {
    if (isSr) option.game = "sr"
    return new MysApi(uid, ck, option)
  }

  /**
   *
   * @param plugin plugin key
   * @param path html文件路径，相对于plugin resources目录
   * @param data 渲染数据
   * @param cfg 渲染配置
   * @param cfg.retType 返回值类型
   * * default/空：自动发送图片，返回true
   * * msgId：自动发送图片，返回msg id
   * * base64: 不自动发送图像，返回图像base64数据
   * @param cfg.beforeRender({data}) 可改写渲染的data数据
   * @returns {Promise<boolean>}
   */
  async render(plugin, path, data = {}, cfg = {}) {
    // 处理传入的path
    path = path.replace(/.html$/, "")
    let paths = lodash.filter(path.split("/"), p => !!p)
    path = paths.join("/")
    // 创建目录
    await Bot.mkdir(`temp/html/${plugin}/${path}`)
    // 自动计算pluResPath
    let pluResPath = `../../../${lodash.repeat("../", paths.length)}plugins/${plugin}/resources/`
    let miaoResPath = `../../../${lodash.repeat("../", paths.length)}plugins/miao-plugin/resources/`
    const layoutPath = process.cwd() + "/plugins/miao-plugin/resources/common/layout/"
    // 渲染data
    data = {
      sys: {
        scale: 1,
      },
      /** miao 相关参数 **/
        copyright: `Created By Lotus-Yunzai <span class="version">${Version?.yunzai}</span><br>
<span style="font-weight: bold; font-size: larger;"> 
  <span style="color: #00BFFF;">机器人主人：</span> 
  <span style="color: #90ee90;">荷花</span> 
  <span style="color: #00BFFF;"> 荷花的小群：</span> 
  <span style="color: #aa381e;">702211432</span> 
</span>`,
      _res_path: pluResPath,
      _miao_path: miaoResPath,
      _tpl_path: process.cwd() + "/plugins/miao-plugin/resources/common/tpl/",
      defaultLayout: layoutPath + "default.html",
      elemLayout: layoutPath + "elem.html",

      ...data,

      /** 默认参数 **/
      _plugin: plugin,
      _htmlPath: path,
      pluResPath,
      tplFile: `./plugins/${plugin}/resources/${path}.html`,
      saveId: data.saveId || data.save_id || paths[paths.length - 1],
    }
    // 处理beforeRender
    if (cfg.beforeRender) {
      data = cfg.beforeRender({ data }) || data
    }
    // 保存模板数据
    if (process.argv.includes("dev")) {
      // debug下保存当前页面的渲染数据，方便模板编写与调试
      // 由于只用于调试，开发者只关注自己当时开发的文件即可，暂不考虑app及plugin的命名冲突
      let saveDir = await Bot.mkdir(`temp/ViewData/${plugin}`)
      let file = `${saveDir}/${data._htmlPath.split("/").join("_")}.json`
      await fs.writeFile(file, JSON.stringify(data))
    }
    // 截图
    let base64 = await puppeteer.screenshot(`${plugin}/${path}`, data)
    if (cfg.retType === "base64") {
      return base64
    }
    let ret = true
    if (base64) {
      if (cfg.recallMsg) {
        ret = await this.e.reply(base64, false, {})
      } else {
        ret = await this.e.reply(base64)
      }
    }
    return cfg.retType === "msgId" ? ret : true
  }

  static async init(e) {
    await MysInfo.initCache()
    e.runtime = new Runtime(e)
    await e.runtime.initUser()
    return e.runtime
  }
}

if (!MysInfo || !NoteUser) Runtime.init = async e => (e.runtime = new Runtime(e))
