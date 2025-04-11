/**
 * PDF.js环境检查工具
 * 用于检测PDF.js环境是否正确配置
 */
import * as pdfjs from "pdfjs-dist";

/**
 * 检查PDF.js环境
 * 主要检查worker路径和cMap配置
 */
export async function checkPdfJsEnvironment(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    console.log("开始检查PDF.js环境...");

    // 检查worker路径是否已设置
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      return {
        success: false,
        message:
          "PDF.js Worker路径未设置，请确保设置pdfjs.GlobalWorkerOptions.workerSrc",
      };
    }

    console.log(`Worker路径已设置: ${pdfjs.GlobalWorkerOptions.workerSrc}`);

    // 检查worker文件是否存在
    try {
      const workerResponse = await fetch(pdfjs.GlobalWorkerOptions.workerSrc);
      if (!workerResponse.ok) {
        return {
          success: false,
          message: `无法加载PDF.js Worker文件: ${pdfjs.GlobalWorkerOptions.workerSrc}, 错误: ${workerResponse.status} ${workerResponse.statusText}`,
        };
      }
      console.log("Worker文件检查成功");
    } catch (error) {
      return {
        success: false,
        message: `无法加载PDF.js Worker文件: ${pdfjs.GlobalWorkerOptions.workerSrc}, 错误: ${error}`,
      };
    }

    // 检查cMap文件夹
    const cMapUrl = "/pdfjs-5.1.91-dist/web/cmaps/";
    try {
      // 检查一个常见的cMap文件
      const cMapResponse = await fetch(`${cMapUrl}Adobe-CNS1-0.bcmap`);
      if (!cMapResponse.ok) {
        return {
          success: false,
          message: `无法加载PDF.js cMap文件: ${cMapUrl}Adobe-CNS1-0.bcmap, 错误: ${cMapResponse.status} ${cMapResponse.statusText}`,
        };
      }
      console.log("cMap文件检查成功");
    } catch (error) {
      return {
        success: false,
        message: `无法加载PDF.js cMap文件，错误: ${error}`,
      };
    }

    // 简单测试一个小PDF
    try {
      const testPdfUrl =
        "/pdfjs-5.1.91-dist/web/compressed.tracemonkey-pldi-09.pdf";
      const testPdfResponse = await fetch(testPdfUrl);
      if (!testPdfResponse.ok) {
        return {
          success: false,
          message: `无法加载测试PDF文件: ${testPdfUrl}`,
        };
      }

      const pdfBytes = await testPdfResponse.arrayBuffer();
      const pdf = await pdfjs.getDocument({
        data: pdfBytes,
        cMapUrl,
        cMapPacked: true,
      }).promise;

      console.log(`测试PDF加载成功，共${pdf.numPages}页`);

      // 测试文本提取
      const page = await pdf.getPage(1);
      const textContent = await page.getTextContent();
      console.log(`第1页文本提取成功，共${textContent.items.length}个文本项`);
    } catch (error) {
      return {
        success: false,
        message: `PDF.js测试失败: ${error}`,
      };
    }

    return {
      success: true,
      message: "PDF.js环境检查通过，所有组件工作正常",
    };
  } catch (error) {
    return {
      success: false,
      message: `PDF.js环境检查失败，未知错误: ${error}`,
    };
  }
}
