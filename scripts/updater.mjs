import { createRequire } from 'module'
import { Octokit } from '@octokit/rest'
import fs from 'fs'
import path from 'path'

const require = createRequire(import.meta.url)
const tauriConfig = require('../src-tauri/tauri.conf.json')

// 从环境变量获取 GitHub token
const token = process.env.GITHUB_TOKEN
const octokit = new Octokit({ auth: token })

// GitHub 仓库信息
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/')
const tag = process.env.GITHUB_REF_NAME

async function main() {
  try {
    console.log(`Processing release for tag: ${tag}`)
    
    // 获取最新的 release
    const { data: release } = await octokit.repos.getReleaseByTag({
      owner,
      repo,
      tag,
    })
    
    console.log(`Found release: ${release.name} (ID: ${release.id})`)
    console.log(`Total assets: ${release.assets.length}`)
    
    if (release.assets.length === 0) {
      console.log('Waiting for assets to be uploaded...')
      // 等待5秒钟让assets上传完成
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // 重新获取release信息
      const { data: refreshedRelease } = await octokit.repos.getRelease({
        owner,
        repo,
        release_id: release.id
      })
      
      console.log(`Refreshed assets count: ${refreshedRelease.assets.length}`)
      
      if (refreshedRelease.assets.length === 0) {
        throw new Error('No assets found in release after waiting')
      }
      
      // 更新release引用
      Object.assign(release, refreshedRelease)
    }

    // 获取完整的 release 信息
    const { data: fullRelease } = await octokit.repos.getRelease({
      owner,
      repo,
      release_id: release.id
    })

    // 打印所有可用的assets以便调试
    console.log('Available assets:')
    release.assets.forEach(asset => {
      console.log(`- ${asset.name} (${asset.browser_download_url})`)
    })
    
    // 构建文件路径
    const basePath = path.resolve('./src-tauri/target/release/bundle')
    
    // 尝试多种可能的文件名模式
    const possibleNames = [
      `invoice-analysis_${tauriConfig.version}_x64-setup.exe`,
      `Invoice Tool_${tauriConfig.version}_x64-setup.exe`,
      `${tauriConfig.productName.replace(/\s+/g, '-')}_${tauriConfig.version}_x64-setup.exe`,
      `${tauriConfig.productName}_${tauriConfig.version}_x64-setup.exe`
    ]
    
    console.log('Looking for setup file with possible names:')
    possibleNames.forEach(name => console.log(`- ${name}`))
    
    // 获取已上传的文件
    let setupAsset = null
    for (const name of possibleNames) {
      setupAsset = release.assets.find(asset => 
        asset.name === name || asset.name.endsWith('-setup.exe')
      )
      if (setupAsset) {
        console.log(`Found setup file: ${setupAsset.name}`)
        break
      }
    }
    
    if (!setupAsset) {
      throw new Error('Setup file not found in release assets')
    }

    // 查找或生成签名文件
    let signature
    try {
      // 尝试从本地读取签名文件
      const setupFileName = setupAsset.name
      const sigFile = path.join(basePath, 'nsis', `${setupFileName}.sig`)
      
      if (fs.existsSync(sigFile)) {
        signature = fs.readFileSync(sigFile, 'utf8')
        console.log('Found signature file locally')
      } else {
        // 尝试找到已上传的签名文件
        const sigAsset = release.assets.find(asset => 
          asset.name === `${setupAsset.name}.sig` || asset.name.endsWith('.exe.sig')
        )
        
        if (sigAsset) {
          // 下载签名内容
          const response = await fetch(sigAsset.browser_download_url)
          signature = await response.text()
          console.log('Downloaded signature from release asset')
        } else {
          throw new Error('Signature file not found')
        }
      }
    } catch (error) {
      console.error('Error getting signature:', error)
      throw new Error('Failed to get signature file: ' + error.message)
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

    // 检查是否已存在 latest.json
    const existingLatestJson = release.assets.find(asset => 
      asset.name === 'latest.json'
    )

    if (existingLatestJson) {
      // 如果存在，先删除
      await octokit.repos.deleteReleaseAsset({
        owner,
        repo,
        asset_id: existingLatestJson.id
      })
      console.log('Deleted existing latest.json')
    }

    // 上传新的 latest.json
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
    console.log('Uploaded new latest.json')

    // 设置为预发布
    await octokit.repos.updateRelease({
      owner,
      repo,
      release_id: release.id,
      prerelease: true,
      draft: true  // 设置为草稿状态，需要手动发布
    })

    console.log('✨ 成功上传 latest.json 并设置为预发布草稿状态')
    console.log('请前往 GitHub Releases 页面编辑发布说明并手动发布')
  } catch (error) {
    console.error('❌ 错误:', error)
    process.exit(1)
  }
}

main()
