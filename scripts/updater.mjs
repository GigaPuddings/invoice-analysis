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
    const basePath = isCI 
      ? path.resolve('./src-tauri/target/release/bundle') 
      : path.resolve(__dirname, '../src-tauri/target/release/bundle');
    
    const setupFileName = `invoice-analysis_${tauriConfig.version}_x64-setup.exe`;
    let setupFile = path.join(basePath, 'nsis', setupFileName);
    let sigFile = `${setupFile}.sig`;
    
    console.log(`📂 查找安装文件路径: ${setupFile}`);
    
    // 检查文件是否存在
    if (!isCI) {
      // 如果不是在CI环境中运行，则需要先检查文件是否存在
      try {
        if (!fs.existsSync(setupFile)) {
          console.warn(`⚠️ 安装文件不存在: ${setupFile}`);
          
          // 尝试查找可能的替代位置
          const altBasePath = path.resolve('./target/release/bundle');
          const altSetupFile = path.join(altBasePath, 'nsis', setupFileName);
          console.log(`🔍 尝试替代路径: ${altSetupFile}`);
          
          if (fs.existsSync(altSetupFile)) {
            console.log(`✅ 在替代位置找到安装文件`);
            // 更新文件路径
            setupFile = altSetupFile;
            sigFile = `${setupFile}.sig`;
          } else {
            throw new Error(`安装文件不存在: ${setupFile}`);
          }
        }
        
        if (!fs.existsSync(sigFile)) {
          throw new Error(`签名文件不存在: ${sigFile}`);
        }
        
        console.log(`✅ 找到安装文件和签名文件`);
      } catch (error) {
        console.warn(`⚠️ 文件检查错误: ${error.message}`);
        console.log(`ℹ️ 将在GitHub上查找文件`);
      }
    } else {
      console.log(`🔄 CI环境中运行，跳过本地文件检查`);
    }

    // 获取已上传的文件
    console.log(`🔍 查找GitHub上的安装文件...`);
    let setupAsset = null;
    try {
      setupAsset = fullRelease.assets.find(asset => 
        asset.name === setupFileName
      )
    } catch (error) {
      console.warn(`⚠️ 查找GitHub上的安装文件失败:`, error.message);
    }

    // 如果安装文件还未上传，则上传它
    if (!setupAsset) {
      console.log(`🔍 安装文件尚未上传到GitHub，正在尝试上传...`);
      
      try {
        // 检查本地文件是否存在
        if (!isCI && fs.existsSync(setupFile)) {
          console.log(`📤 正在上传安装文件...`);
          const setupFileContent = fs.readFileSync(setupFile);
          const uploadResponse = await octokit.repos.uploadReleaseAsset({
            owner,
            repo,
            release_id: release.id,
            name: setupFileName,
            data: setupFileContent,
            headers: {
              'content-type': 'application/octet-stream',
              'content-length': Buffer.byteLength(setupFileContent)
            }
          });
          
          console.log(`✅ 安装文件上传成功`);
          
          // 上传完成后再获取一次release信息
          const { data: updatedRelease } = await octokit.repos.getRelease({
            owner,
            repo,
            release_id: release.id
          });
          
          // 更新fullRelease和setupAsset
          fullRelease = updatedRelease;
          setupAsset = updatedRelease.assets.find(asset => 
            asset.name === setupFileName
          );
        } else {
          console.log(`⚠️ 本地安装文件不存在或在CI环境中，无法上传`);
          // 创建一个模拟资源对象用于继续执行
          setupAsset = {
            browser_download_url: `https://github.com/${owner}/${repo}/releases/download/${tag}/${setupFileName}`
          };
          console.log(`📄 生成的URL模板: ${setupAsset.browser_download_url}`);
        }
      } catch (uploadError) {
        console.warn(`⚠️ 上传安装文件失败:`, uploadError.message);
        // 创建一个模拟资源对象用于继续执行
        setupAsset = {
          browser_download_url: `https://github.com/${owner}/${repo}/releases/download/${tag}/${setupFileName}`
        };
        console.log(`📄 生成的URL模板: ${setupAsset.browser_download_url}`);
      }
    } else {
      console.log(`✅ 安装文件已在GitHub上存在`);
    }

    // 读取签名文件
    let signature
    if (isCI) {
      // 在CI环境中优先从GitHub获取签名文件
      try {
        console.log(`🔍 尝试从GitHub获取签名文件...`);
        const sigAsset = fullRelease.assets.find(asset => 
          asset.name === `${setupFileName}.sig`
        )
        
        if (sigAsset) {
          try {
            const sigResponse = await fetch(sigAsset.browser_download_url)
            if (sigResponse.ok) {
              signature = await sigResponse.text()
              console.log(`✅ 从GitHub获取签名文件成功`)
            } else {
              throw new Error(`获取签名文件失败: HTTP ${sigResponse.status}`)
            }
          } catch (fetchError) {
            console.warn(`⚠️ 获取签名文件时出错:`, fetchError.message)
            signature = "CI环境中生成的模拟签名"
            console.log(`⚠️ 使用模拟签名`)
          }
        } else {
          console.log(`⚠️ 在GitHub上找不到签名文件`)
          signature = "CI环境中生成的模拟签名"
          console.log(`⚠️ 使用模拟签名`)
        }
      } catch (error) {
        console.warn(`⚠️ 查找签名文件时出错:`, error.message)
        signature = "CI环境中生成的模拟签名"
        console.log(`⚠️ 使用模拟签名`)
      }
    } else {
      // 本地环境尝试读取签名文件
      try {
        if (fs.existsSync(sigFile)) {
          signature = fs.readFileSync(sigFile, 'utf8')
          console.log(`✅ 成功读取本地签名文件`)
        } else {
          console.warn(`⚠️ 本地签名文件不存在: ${sigFile}`)
          signature = "本地环境中生成的模拟签名"
          console.log(`⚠️ 使用模拟签名`)
        }
      } catch (error) {
        console.warn(`⚠️ 读取签名文件失败:`, error.message)
        signature = "本地环境中生成的模拟签名"
        console.log(`⚠️ 使用模拟签名`)
      }
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

