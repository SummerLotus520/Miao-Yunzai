import Renderer from "../../../lib/renderer/Renderer.js"
import os from "node:os"
import lodash from "lodash"
import puppeteer from "puppeteer"
import { ulid } from "ulid"
import timers from "node:timers/promises"
import fs from "node:fs/promises"
// 暂时保留对原config的兼容
import cfg from "../../../lib/config/config.js"

const _path = process.cwd()
// mac地址
let mac = ""

export default class Puppeteer extends Renderer {
  constructor(config) {
    super({
      id: "puppeteer",
      type: "image",
      render: "screenshot",
    })
    this.browser = false
    this.lock = false
    this.shoting = []
    /** 截图数达到时重启浏览器 避免生成速度越来越慢 */
    this.restartNum = 100
    /** 截图次数 */
    this.renderNum = 0
    this.config = {
      headless: "new",
      args: ["--disable-gpu", "--disable-setuid-sandbox", "--no-sandbox", "--no-zygote"],
      ...config,
    }
    if (config.chromiumPath || cfg?.bot?.chromium_path)
      /** chromium其他路径 */
      this.config.executablePath = config.chromiumPath || cfg?.bot?.chromium_path
    if (config.puppeteerWS || cfg?.bot?.puppeteer_ws)
      /** chromium其他路径 */
      this.config.wsEndpoint = config.puppeteerWS || cfg?.bot?.puppeteer_ws
    /** puppeteer超时超时时间 */
    this.puppeteerTimeout = config.puppeteerTimeout || cfg?.bot?.puppeteer_timeout || 0
    this.pageGotoParams = config.pageGotoParams || {
      timeout: 120000,
      waitUntil: "networkidle2",
    }
  }

  /**
   * 初始化chromium
   */
  async browserInit() {
    if (this.browser) return this.browser
    if (this.lock) return false
    this.lock = true

    logger.info("puppeteer Chromium 启动中...")

    let connectFlag = false
    try {
      // 获取Mac地址
      if (!mac) {
        mac = await this.getMac()
        this.browserMacKey = `Yz:chromium:browserWSEndpoint:${mac}`
      }
      // 是否有browser实例
      const browserUrl = (await redis.get(this.browserMacKey)) || this.config.wsEndpoint
      if (browserUrl) {
        try {
          const browserWSEndpoint = await puppeteer.connect({ browserWSEndpoint: browserUrl })
          // 如果有实例，直接使用
          if (browserWSEndpoint) {
            this.browser = browserWSEndpoint
            connectFlag = true
          }
          logger.info(`puppeteer Chromium 连接成功 ${browserUrl}`)
        } catch (err) {
          await redis.del(this.browserMacKey)
        }
      }
    } catch {}

    if (!this.browser || !connectFlag) {
      let config = this.config
      if (!config.userDataDir) {
        await fs.rm("temp/puppeteer", { force: true, recursive: true }).catch(() => {})
        config = { ...config, userDataDir: `temp/puppeteer/${ulid()}` }
      }
      // 如果没有实例，初始化puppeteer
      this.browser = await puppeteer.launch(config).catch(async (err, trace) => {
        const errMsg = err.toString() + (trace ? trace.toString() : "")
        logger.error(err, trace)
        if (errMsg.includes("Could not find Chromium"))
          logger.error(
            "没有正确安装 Chromium，可以尝试执行安装命令：node node_modules/puppeteer/install.js",
          )
        else if (errMsg.includes("cannot open shared object file"))
          logger.error("没有正确安装 Chromium 运行库")
      })
    }

    this.lock = false
    if (!this.browser) {
      logger.error("puppeteer Chromium 启动失败")
      return false
    }
    if (!connectFlag) {
      logger.info(`puppeteer Chromium 启动成功 ${this.browser.wsEndpoint()}`)
      if (this.browserMacKey) {
        // 缓存一下实例30天
        const expireTime = 60 * 60 * 24 * 30
        await redis.set(this.browserMacKey, this.browser.wsEndpoint(), { EX: expireTime })
      }
    }

    /** 监听Chromium实例是否断开 */
    this.browser.on("disconnected", () => this.restart(true))

    return this.browser
  }

  // 获取Mac地址
  getMac() {
    let mac = "00:00:00:00:00:00"
    try {
      const network = os.networkInterfaces()
      let macFlag = false
      for (const a in network) {
        for (const i of network[a]) {
          if (i.mac && i.mac !== mac) {
            macFlag = true
            mac = i.mac
            break
          }
        }
        if (macFlag) {
          break
        }
      }
    } catch (e) {}
    mac = mac.replace(/:/g, "")
    return mac
  }

  /**
   * `chromium` 截图
   */
  async screenshot(name, data = {}) {
    if (!(await this.browserInit())) return false
    const pageHeight = data.multiPageHeight || 4000

    const savePath = this.dealTpl(name, data)
    if (!savePath) return false

    let buff = ""
    const start = Date.now()

    let ret = []
    this.shoting.push(name)

    const puppeteerTimeout = this.puppeteerTimeout
    let overtime
    if (puppeteerTimeout > 0) {
      overtime = setTimeout(() => {
        if (this.shoting.length) {
          logger.error(`[图片生成][${name}] 截图超时，当前等待队列：${this.shoting.join(",")}`)
          this.restart(true)
          this.shoting = []
        }
      }, puppeteerTimeout)
    }

    try {
      const page = await this.browser.newPage()
      const pageGotoParams = lodash.extend(this.pageGotoParams, data.pageGotoParams || {})
      await page.goto(`file://${_path}${lodash.trim(savePath, ".")}`, pageGotoParams)
      
      const keywordReplacement = { from: new RegExp('TRSS', 'gi'), to: 'LotusFork' };
      const copyrightHtml = `
          <span style="font-weight: bold; color: gold;">Yunzai-Fork</span> &
          <span style="font-weight: bold; color: gold;">Miao-Plugin-Fork</span> By
          <span style="font-weight: bold; color: #90ee90;">Lotus</span><br>
          <span style="font-weight: bold; font-size: larger;">
            <span style="color: #00BFFF;">机器人主人：</span>
            <span style="color: #90ee90;">荷花</span>
            <span style="color: #00BFFF;"> 荷花的小群：</span>
            <span style="color: #ff3030; font-weight: bold; font-size: x-large;">702211431</span>
          </span><br>
          服务器到期/机器人停运日期：<span style="color: #ff3030; font-weight: bold; font-size: x-large;">2026/01</span><br>
          感谢您的<span style="color: #ff3030; font-weight: bold; font-size: x-large;">捐赠</span> 你的捐赠是对机器人运行最大的支持续命！
      `;

      await page.evaluate((replacement, copyright) => {
        // 关键词替换
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walk.nextNode()) {
            if (node.nodeValue) {
                node.nodeValue = node.nodeValue.replace(replacement.from, replacement.to);
            }
        }

        // 版权添加 (动态内边距模式)
        document.body.style.position = 'relative';

        const overlayDiv = document.createElement('div');
        overlayDiv.id = 'unified-copyright-overlay';
        overlayDiv.style.position = 'absolute';
        overlayDiv.style.bottom = '0';
        overlayDiv.style.left = '0';
        overlayDiv.style.right = '0';
        overlayDiv.style.padding = '10px';
        overlayDiv.style.boxSizing = 'border-box';
        overlayDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        overlayDiv.style.color = '#000000';
        overlayDiv.style.textAlign = 'center';
        overlayDiv.style.lineHeight = '1.5';
        overlayDiv.style.fontFamily = '"MiSans VF Regular", sans-serif';
        overlayDiv.style.zIndex = '9999';
        overlayDiv.innerHTML = copyright;
        document.body.appendChild(overlayDiv);

        // 测量版权信息的高度，并将其作为内边距添加到body底部
        const overlayHeight = overlayDiv.offsetHeight;
        document.body.style.paddingBottom = `${overlayHeight}px`;

      }, keywordReplacement, copyrightHtml);

      const body = (await page.$("#container")) || (await page.$("body"))

      const boundingBox = await body.boundingBox()
      let num = 1

      const randData = {
        type: data.imgType || "jpeg",
        omitBackground: data.omitBackground || false,
        quality: data.quality || 90,
        path: data.path || "",
      }

      if (data.multiPage) {
        randData.type = "jpeg"
        num = Math.round(boundingBox.height / pageHeight) || 1
      }

      if (data.imgType === "png") delete randData.quality

      if (!data.multiPage) {
        buff = await body.screenshot(randData)
        if (!Buffer.isBuffer(buff)) buff = Buffer.from(buff)
        this.renderNum++
        const kb = (buff.length / 1024).toFixed(2) + "KB"
        logger.mark(
          `[图片生成][${name}][${this.renderNum}次] ${kb} ${logger.green(`${Date.now() - start}ms`)}`,
        )
        ret.push(buff)
      } else {
        if (num > 1) {
          await page.setViewport({
            width: boundingBox.width,
            height: pageHeight + 100,
          })
        }
        for (let i = 1; i <= num; i++) {
          if (i !== 1 && i === num)
            await page.setViewport({
              width: boundingBox.width,
              height: parseInt(boundingBox.height) - pageHeight * (num - 1),
            })
          if (i !== 1 && i <= num)
            await page.evaluate(pageHeight => window.scrollBy(0, pageHeight), pageHeight)
          if (num === 1) buff = await body.screenshot(randData)
          else buff = await page.screenshot(randData)
          if (!Buffer.isBuffer(buff)) buff = Buffer.from(buff)
          if (num > 2) await timers.setTimeout(200)
          this.renderNum++
          const kb = (buff.length / 1024).toFixed(2) + "KB"
          logger.mark(`[图片生成][${name}][${i}/${num}] ${kb}`)
          ret.push(buff)
        }
        if (num > 1) {
          logger.mark(`[图片生成][${name}] 处理完成`)
        }
      }
      page.close().catch(err => logger.error(err))
    } catch (err) {
      logger.error(`[图片生成][${name}] 图片生成失败`, err)
      this.restart(true)
      if (overtime) clearTimeout(overtime)
      ret = []
      return false
    } finally {
      if (overtime) clearTimeout(overtime)
    }

    this.shoting.pop()

    if (ret.length === 0 || !ret[0]) {
      logger.error(`[图片生成][${name}] 图片生成为空`)
      return false
    }

    this.restart()
    return data.multiPage ? ret : ret[0]
  }

  restart(force = false) {
    if (!this.browser?.close || this.lock) return
    if (!force) if (this.renderNum % this.restartNum !== 0 || this.shoting.length > 0) return
    logger.info(`puppeteer Chromium ${force ? "强制" : ""}关闭重启...`)
    this.stop(this.browser)
    this.browser = false
    return this.browserInit()
  }

  async stop(browser) {
    try {
      await browser.close()
    } catch (err) {
      logger.error("puppeteer Chromium 关闭错误", err)
    }
  }
}