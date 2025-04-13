import { createRequire } from 'module'
import { Octokit } from '@octokit/rest'
import fs from 'fs'
import path from 'path'
import pkg from 'node-fetch'
const { default: fetch } = pkg

const require = createRequire(import.meta.url)
const tauriConfig = require('../src-tauri/tauri.conf.json')

// 从环境变量获取配置
const token = process.env.GITHUB_TOKEN
const writeLocalJson = process.env.WRITE_LOCAL_JSON === 'true'

console.log('配置状态:')
console.log('- WRITE_LOCAL_JSON:', writeLocalJson)
console.log('- TOKEN 存在:', !!token)

// 初始化octokit（如果有token）
const octokit = token ? new Octokit({ auth: token }) : null

// GitHub 仓库信息
const githubRepo = process.env.GITHUB_REPOSITORY || 'GigaPuddings/invoice-analysis'
const [owner, repo] = githubRepo ? githubRepo.split('/') : ['default-owner', 'invoice-analysis']
const tag = process.env.GITHUB_REF_NAME || tauriConfig.version // 添加默认值，使用配置中的版本号

// 判断是否在CI环境中运行
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'

if (!token) {
  console.warn('警告: 未设置GITHUB_TOKEN环境变量')
  console.warn('提示: 请确保设置以下环境变量:')
  console.warn('- GITHUB_TOKEN: 你的GitHub个人访问令牌')
  console.warn('- GITHUB_REPOSITORY: 仓库所有者/仓库名称 (例如: username/invoice-analysis)')
  console.warn('- GITHUB_REF_NAME: 发布的标签名称 (例如: v0.0.1)')
}

async function main() {
  try {
    if (!token) {
      throw new Error('未设置GITHUB_TOKEN环境变量')
    }

    let release = null
    let fullRelease = null
    
    try {
      // 尝试获取最新的 release
      const response = await octokit.repos.getReleaseByTag({
        owner,
        repo,
        tag,
      })
      release = response.data
      console.log(`✅ 找到标签 ${tag} 的发布版本`)
    } catch (error) {
      if (error.status === 404) {
        console.log(`🔍 找不到标签 ${tag} 的发布版本，正在创建...`)
        // 如果不存在，创建一个新的发布
        const createResponse = await octokit.repos.createRelease({
          owner,
          repo,
          tag_name: tag,
          name: `发布 ${tag}`,
          draft: true,
          prerelease: true
        })
        release = createResponse.data
        console.log(`✅ 成功创建标签 ${tag} 的新发布版本`)
      } else {
        throw error
      }
    }

    // 获取完整的 release 信息
    const fullReleaseResponse = await octokit.repos.getRelease({
      owner,
      repo,
      release_id: release.id
    })
    fullRelease = fullReleaseResponse.data

    // 构建文件路径
    const basePath = path.resolve('./src-tauri/target/release/bundle')
    const setupFile = path.join(basePath, 'nsis', `invoice-analysis_${tauriConfig.version}_x64-setup.exe`)
    const sigFile = `${setupFile}.sig`

    // 检查文件是否存在
    if (!isCI) {
      // 如果不是在CI环境中运行，则需要先检查文件是否存在
      if (!fs.existsSync(setupFile)) {
        throw new Error(`安装文件不存在: ${setupFile}`)
      }
      
      if (!fs.existsSync(sigFile)) {
        throw new Error(`签名文件不存在: ${sigFile}`)
      }
      
      console.log(`✅ 找到安装文件和签名文件`)
    } else {
      console.log(`🔄 CI环境中运行，跳过本地文件检查`)
    }

    // 获取已上传的文件
    let setupAsset = fullRelease.assets.find(asset => 
      asset.name === `invoice-analysis_${tauriConfig.version}_x64-setup.exe`
    )

    // 如果安装文件还未上传，则上传它
    if (!setupAsset) {
      console.log(`🔍 安装文件尚未上传到GitHub，正在上传...`)
      
      const setupFileContent = fs.readFileSync(setupFile)
      await octokit.repos.uploadReleaseAsset({
        owner,
        repo,
        release_id: release.id,
        name: `invoice-analysis_${tauriConfig.version}_x64-setup.exe`,
        data: setupFileContent,
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': Buffer.byteLength(setupFileContent)
        }
      })
      
      // 上传完成后再获取一次release信息
      const { data: updatedRelease } = await octokit.repos.getRelease({
        owner,
        repo,
        release_id: release.id
      })
      
      // 更新setupAsset
      const updatedSetupAsset = updatedRelease.assets.find(asset => 
        asset.name === `invoice-analysis_${tauriConfig.version}_x64-setup.exe`
      )
      
      if (!updatedSetupAsset) {
        throw new Error('上传安装文件后未能找到该资源')
      }
      
      console.log(`✅ 成功上传安装文件`)
      
      // 更新setupAsset引用
      setupAsset = updatedSetupAsset
    } else {
      console.log(`✅ 安装文件已在GitHub上存在`)
    }

    // 读取签名文件
    let signature
    if (isCI) {
      // 在CI环境中可能没有签名文件，尝试从API获取
      try {
        const sigAsset = fullRelease.assets.find(asset => 
          asset.name === `invoice-analysis_${tauriConfig.version}_x64-setup.exe.sig`
        )
        
        if (sigAsset) {
          const sigResponse = await fetch(sigAsset.browser_download_url)
          signature = await sigResponse.text()
          console.log(`✅ 从GitHub获取签名文件成功`)
        } else {
          signature = "CI环境中生成的模拟签名"
          console.log(`⚠️ 在GitHub上找不到签名文件，使用模拟签名`)
        }
      } catch (error) {
        signature = "CI环境中生成的模拟签名"
        console.log(`⚠️ 获取签名文件失败，使用模拟签名：`, error)
      }
    } else {
      signature = fs.readFileSync(sigFile, 'utf8')
    }

    // 创建 latest.json
    const latestJson = {
      version: tauriConfig.version,
      notes: fullRelease.body || '本次更新暂无说明',
      pub_date: fullRelease.published_at,
      platforms: {
        'windows-x86_64': {
          url: setupAsset.browser_download_url,
          signature: signature.trim()
        }
      }
    }

    console.log('📝 生成的latest.json内容:', JSON.stringify(latestJson, null, 2))

    // 检查是否已存在 latest.json
    const existingLatestJson = fullRelease.assets.find(asset => 
      asset.name === 'latest.json'
    )

    if (existingLatestJson) {
      // 如果存在，先删除
      console.log('🔄 删除现有的latest.json...')
      await octokit.repos.deleteReleaseAsset({
        owner,
        repo,
        asset_id: existingLatestJson.id
      })
    }

    // 上传新的 latest.json
    console.log('📤 上传新的latest.json...')
    const latestJsonContent = JSON.stringify(latestJson, null, 2)
    await octokit.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: release.id,
      name: 'latest.json',
      data: latestJsonContent,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(latestJsonContent)
      }
    })

    // 设置为预发布
    console.log('🔄 更新发布设置...')
    await octokit.repos.updateRelease({
      owner,
      repo,
      release_id: release.id,
      prerelease: true,
      draft: true  // 设置为草稿状态，需要手动发布
    })

    console.log('✨ 操作完成')
    console.log('请前往 GitHub Releases 页面编辑发布说明并手动发布')
  } catch (error) {
    console.error('❌ 错误:', error)
    process.exit(1)
  }
}

main()

