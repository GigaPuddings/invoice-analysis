/**
 * PDF解析工具类，使用PDF.js提取文本及位置信息
 */
import * as pdfjs from "pdfjs-dist";
import { invoke } from "@tauri-apps/api/core";

// 设置PDF.js worker路径
pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs-5.1.91-dist/build/pdf.worker.mjs";

// 进度回调类型定义
export type ProgressCallback = (current: number, total: number) => void;

// 发票项目类型
export interface InvoiceItem {
  name: string;
  quantity: string;
  price: string;
  amount: string;
  tax_rate: string;
  tax: string;
}

// 发票交易方信息
export interface InvoiceParty {
  name: string;
  tax_code: string;
  address_phone: string;
  bank_account: string;
}

// 发票信息结构
export interface Invoice {
  filename: string;
  index: number;
  title: string;
  invoice_type: string;
  code: string;
  number: string;
  date: string;
  checksum: string;
  machine_number: string;
  password: string;
  remark: string;
  buyer: InvoiceParty;
  seller: InvoiceParty;
  items: InvoiceItem[];
  total_amount: string;
  total_tax: string;
  total_amount_tax: string;
  payee: string;
  reviewer: string;
  drawer: string;
  status: string;
  duplicate_info: string;
}

// 文本位置信息
export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
  fontName?: string;
}

/**
 * 解析PDF文件
 * @param file PDF文件对象
 * @param progressCallback 进度回调函数
 * @returns 解析后的发票信息数组
 */
export async function parsePdfFile(
  file: File,
  progressCallback?: ProgressCallback
): Promise<Invoice[]> {
  try {
    // 通知开始解析
    progressCallback?.(0, 100);
    
    // 读取文件为ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    progressCallback?.(10, 100); // 文件读取完成，进度10%
    
    // 加载PDF文档，添加cMapUrl和cMapPacked参数
    const pdf = await pdfjs.getDocument({
      data: arrayBuffer,
      cMapUrl: "/pdfjs-5.1.91-dist/web/cmaps/",
      cMapPacked: true,
      // 在这里添加更多日志记录
      verbosity: 1,
    }).promise;
    
    progressCallback?.(20, 100); // PDF文档加载完成，进度20%

    // 所有页面的文本项按页存储
    const allPagesTextItems: TextItem[][] = [];
    const pageCount = pdf.numPages;

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });

      // 去除所有文本项的空格
      textContent.items = textContent.items.filter(
        (item: any) => item.str.trim() !== ""
      );

      const pageTextItems: TextItem[] = [];

      // 处理每个文本项
      textContent.items.forEach((item: any) => {
        const tx = pdfjs.Util.transform(viewport.transform, item.transform);

        const textItem: TextItem = {
          text: item.str.replace(/\s*/g, ""),
          x: tx[4], // x坐标
          y: tx[5], // y坐标
          width: item.width || 0,
          height: item.height || 0,
          pageIndex: i - 1,
          fontName: item.fontName || "",
        };
        pageTextItems.push(textItem);
      });

      allPagesTextItems.push(pageTextItems);
      
      // 更新进度：每页解析完成后更新进度
      const pageProgress = 20 + Math.round((i / pageCount) * 60);
      progressCallback?.(pageProgress, 100);
    }

    // 通知开始调用后端解析
    progressCallback?.(80, 100);
    
    // 调用后端 Rust 代码解析发票信息
    const invoices = await invoke<Invoice[]>("parse_invoice_text", {
      filename: file.name,
      pagesTextItems: allPagesTextItems
    });
    
    // 解析完成
    progressCallback?.(100, 100);

    return invoices;
  } catch (error) {
    console.error("PDF解析错误:", error);
    progressCallback?.(100, 100); // 即使发生错误也标记为完成
    // 解析失败时返回包含一个失败状态发票的数组
    return [createEmptyInvoice(file.name, "解析失败", 0)];
  }
}

/**
 * 创建空的发票对象
 */
function createEmptyInvoice(
  filename: string,
  status: string = "待统计",
  pageIndex: number = 0
): Invoice {
  // 添加页面索引到文件名以区分多页发票
  const filenameWithPage =
    pageIndex > 0 ? `${filename}#第${pageIndex + 1}页` : filename;

  return {
    filename: filenameWithPage,
    index: 0,
    title: "",
    invoice_type: "",
    code: "",
    number: "",
    date: "",
    checksum: "",
    machine_number: "",
    password: "",
    remark: "",
    buyer: {
      name: "",
      tax_code: "",
      address_phone: "",
      bank_account: "",
    },
    seller: {
      name: "",
      tax_code: "",
      address_phone: "",
      bank_account: "",
    },
    items: [],
    total_amount: "0.00", // 合计金额
    total_tax: "0.00", // 合计税额
    total_amount_tax: "0.00", // 价税合计
    payee: "",
    reviewer: "",
    drawer: "",
    status,
    duplicate_info: "",
  };
}

/**
 * 根据参考点提取相邻文本
 * @param textItems 所有文本项
 * @param referenceText 参考文本
 * @param direction 查找方向
 * @param maxDistance 最大距离
 */
// function extractNearbyText(
//   textItems: TextItem[],
//   referenceText?: RegExp,
//   direction: "right" | "left" | "up" | "down" | "same-line" = "right",
//   maxDistance: number = 100
// ): string {
//   // 找到参考文本项
//   const refItem = textItems.find(
//     (item) => referenceText && referenceText.test(item.text)
//   );
//   if (!refItem) return "";

//   // 根据方向筛选候选文本项
//   const candidates = textItems.filter((item) => {
//     // 排除参考项自身
//     if (item === refItem) return false;

//     // 根据方向过滤
//     switch (direction) {
//       case "right":
//         return (
//           Math.abs(item.y - refItem.y) < 10 && // 同一行或接近
//           item.x > refItem.x && // 在参考项右侧
//           item.x - refItem.x < maxDistance
//         ); // 距离在范围内
//       case "left":
//         return (
//           Math.abs(item.y - refItem.y) < 10 && // 同一行或接近
//           item.x < refItem.x && // 在参考项左侧
//           refItem.x - item.x < maxDistance
//         ); // 距离在范围内
//       case "up":
//         return (
//           Math.abs(item.x - refItem.x) < maxDistance / 2 && // x坐标接近
//           item.y > refItem.y && // 在参考项上方
//           item.y - refItem.y < maxDistance
//         ); // 距离在范围内
//       case "down":
//         return (
//           Math.abs(item.x - refItem.x) < maxDistance / 2 && // x坐标接近
//           item.y < refItem.y && // 在参考项下方
//           refItem.y - item.y < maxDistance
//         ); // 距离在范围内
//       case "same-line":
//         return (
//           Math.abs(item.y - refItem.y) < 10 && // 同一行或接近
//           Math.abs(item.x - refItem.x) < maxDistance
//         ); // 水平距离在范围内
//       default:
//         return false;
//     }
//   });

//   // 按照与参考点的距离排序
//   candidates.sort((a, b) => {
//     const distA = Math.sqrt(
//       Math.pow(a.x - refItem.x, 2) + Math.pow(a.y - refItem.y, 2)
//     );
//     const distB = Math.sqrt(
//       Math.pow(b.x - refItem.x, 2) + Math.pow(b.y - refItem.y, 2)
//     );
//     return distA - distB;
//   });

//   // 如果是水平方向，还需要按照从左到右排序
//   if (direction === "right" || direction === "same-line") {
//     candidates.sort((a, b) => a.x - b.x);
//   } else if (direction === "left") {
//     candidates.sort((a, b) => b.x - a.x);
//   } else if (direction === "up") {
//     candidates.sort((a, b) => b.y - a.y);
//   } else if (direction === "down") {
//     candidates.sort((a, b) => a.y - b.y);
//   }

//   // console.log("candidates", candidates);
//   // console.log(`${refItem.text}【${candidates.map((item) => item.text).join(" ")}】`);

//   // 取最接近的文本或合并多个文本
//   return candidates
//     .map((item) => item.text)
//     .join(" ")
//     .trim();
// }

/**
 * 提取发票购买方和销售方信息
 * @param textItems 所有文本项
 * @param invoice 发票对象
 * @param headerChar 标识字符 (购/销)
 * @param isSellerInfo 是否为销售方
 */
// function extractPartyInfo(
//   textItems: TextItem[],
//   invoice: Invoice,
//   headerChar: string,
//   isSellerInfo: boolean
// ): void {
//   // 标识字符 (购/销)
//   const headerItem = textItems.find((item) => item.text === headerChar);

//   if (!headerItem) return;

//   // console.log(`${isSellerInfo ? "销售方" : "购买方"}`, headerItem);

//   const headerX = headerItem.x;
//   const headerY = headerItem.y;

//   // 查找底部边界的文本项
//   const footerItem = textItems.reduce<TextItem | null>((result, item) => {
//     if (Math.abs(headerX - item.x) > 1) return result; // 纵向排列误差小于1
//     if (item.y > headerY && item.text === "息") return item; // 上下间隔 找到"息"直接返回
//     if (
//       item.y > headerY &&
//       (item.text === "方" || item.text === "⽅") &&
//       !result
//     ) {
//       return item; // 只有还没找到更高优先级结果时才记录"方"
//     }
//     return result;
//   }, null);

//   // console.log('footerItem', footerItem);

//   if (!footerItem) return;

//   // 区域坐标偏移量
//   const offsetXLeft = invoice.invoice_type === "普通发票" ? 8 : 15;
//   const offsetXRight = invoice.invoice_type === "普通发票" ? 250 : 300;
//   const offsetY = invoice.invoice_type === "普通发票" ? 0 : 8;

//   // 信息区域坐标
//   const areaLeftTop = {
//     x: Math.floor(headerX) + offsetXLeft,
//     y: Math.floor(headerY) - offsetY,
//   };
//   const areaRightTop = {
//     x: Math.floor(headerX) + offsetXRight,
//     y: Math.floor(headerY) - offsetY,
//   };
//   const areaLeftBottom = {
//     x: Math.floor(footerItem.x) + offsetXLeft,
//     y: Math.floor(footerItem.y) + offsetY,
//   };


//   // 查找区域内的所有文本项
//   const areaItems = textItems.filter(
//     (item) =>
//       item.x >= areaLeftTop.x &&
//       item.x <= areaRightTop.x &&
//       item.y >= areaLeftTop.y &&
//       item.y <= areaLeftBottom.y &&
//       item.pageIndex === footerItem.pageIndex
//   );

//   // console.log(`${isSellerInfo ? "销售方" : "购买方"}区域文本项:`, areaItems);

//   // 获取特定字段的值
//   const getFieldValue = (labelPattern: RegExp): string => {
//     const labelItem = areaItems.find((item) => labelPattern.test(item.text));
//     if (!labelItem) return "";

//     const { x: labelX, width: labelWidth, y: labelY } = labelItem;
//     const labelRight = labelX + labelWidth;
//     let result = "";
//     for (const item of areaItems) {
//       if (item.x + item.width > labelRight && Math.abs(item.y - labelY) <= 2) {
//         result += item.text;
//       }
//     }
//     return result;
//   };

//   // 设置到相应的对象
//   const partyObj = isSellerInfo ? invoice.seller : invoice.buyer;

//   // 提取名称
//   partyObj.name = getFieldValue(/称[:：]$/);
//   // console.log(`${isSellerInfo ? "销售方" : "购买方"}名称：`, partyObj.name);

//   // 提取纳税人识别号
//   partyObj.tax_code = getFieldValue(/识别号[:：]$/);
//   // console.log(
//   //   `${isSellerInfo ? "销售方" : "购买方"}纳税人识别号：`,
//   //   partyObj.tax_code
//   // );

//   // 提取地址、电话
//   partyObj.address_phone = getFieldValue(/电话[:：]$/);
//   // console.log(
//   //   `${isSellerInfo ? "销售方" : "购买方"}地址、电话：`,
//   //   partyObj.address_phone
//   // );

//   // 提取开户行及账号
//   partyObj.bank_account = getFieldValue(/开户行及账号[:：]$/);
//   // console.log(
//   //   `${isSellerInfo ? "销售方" : "购买方"}开户行及账号：`,
//   //   partyObj.bank_account
//   // );
// }

/**
 * 提取备注信息
 * @param textItems 所有文本项
 * @param invoice 发票对象
 */
// function extractRemarkInfo(textItems: TextItem[], invoice: Invoice): void {
//   // 查找参考项
//   const headerItem = textItems.find((item) => item.text === "备");
//   if (!headerItem) return;
//   const hw = headerItem.x + headerItem.width;
//   const lt = headerItem.y - 14;
//   const lb = headerItem.y + 33;
//   // console.log(lt)
//   // console.log(lb)
//   // 查询区域内的所有文本
//   const areaItems = textItems.filter(
//     (item) =>
//       item.x >= hw && // 右侧
//       item.y >= lt && //最上侧边界
//       item.y <= lb //最下侧边界
//   );
//   // console.log(areaItems);

//   let result = "";
//   for (let i = 0; i < areaItems.length; i++) {
//     const r = areaItems[i];
//     if (areaItems[i - 1] && areaItems[i - 1].y !== areaItems[i].y) {
//       result += "\n";
//     }
//     result += r.text;
//   }

//   invoice.remark = result;

//   // console.log("备注", invoice.remark);
// }

// // 1. 按y坐标进行分组，形成每一"行"
// function groupItemsByRow(items: any, yTolerance = 2) {
//   const rows: any[][] = [];

//   for (const item of items) {
//     let matched = false;

//     for (const row of rows) {
//       if (Math.abs(row[0].y - item.y) <= yTolerance) {
//         row.push(item);
//         matched = true;
//         break;
//       }
//     }

//     if (!matched) {
//       rows.push([item]);
//     }
//   }

//   // 每行内部按x排序
//   rows.forEach((row) => row.sort((a, b) => a.x - b.x));

//   // 所有行按y排序
//   rows.sort((a, b) => a[0].y - b[0].y);

//   return rows;
// }

/**
 * 提取发票商品信息
 * @param textItems 所有文本项
 * @param invoice 发票对象
 */
// function extractInvoiceItems(textItems: TextItem[], invoice: Invoice): void {
//   // 查找商品表头行 - 通常包含"货物名称"、"规格型号"、"单位"、"数量"等字段
//   const nameHeaderItem = textItems.find(
//     (item) => item.text.includes("货物") || item.text.includes("项目")
//   );

//   if (!nameHeaderItem) {
//     // 没有找到表头，添加一个空的商品项
//     invoice.items.push({
//       name: "未能识别",
//       quantity: "0",
//       price: "0",
//       amount: "0",
//       tax_rate: "0",
//       tax: "0",
//     });
//     return;
//   }

//   // 确定表格的垂直范围 - 通常表头下方到"合计"行之前
//   const modelBottomItem = textItems.find(
//     (item) => item.text === "合" || item.text === "合计"
//   )!;

//   const modelHeaderY = nameHeaderItem.y - 2; //
//   const modelBottomY = modelBottomItem.y || 260;

//   // 发票明细区域
//   const areaItems = textItems.filter((item) => {
//     return (
//       item.y >= modelHeaderY && // 上边界
//       item.y < modelBottomY &&
//       Math.abs(modelBottomY - item.y) >= 5
//     ); // 下边界
//   });

//   // 排除标题区域
//   const noTile = nameHeaderItem.y + 5;
//   const valueItems = areaItems.filter((item) => item.y >= noTile);

//   // 组
//   const groupedRows = groupItemsByRow(valueItems, 2);

//   for (let i = 0; i < groupedRows.length; i++) {
//     const row = groupedRows[i];
//     const result: any = {};

//     // 判断是否是补充名称行（只有一个字段且不以 * 开头）
//     if (
//       row.length <= 3 &&
//       !/^\*/.test(row[0].text) &&
//       i > 0 &&
//       invoice.items.length > 0
//     ) {
//       invoice.items[invoice.items.length - 1].name += row[0].text;
//       continue; // 当前行不作为新的一项
//     }

//     // 正常行解析
//     row.forEach((textItem, index) => {
//       const value = textItem.text;

//       // 名称（通常是第一列，可能以 * 开头）
//       if (index === 0) {
//         result.name = value;
//       }

//       if (index === row.length - 5 || index === row.length - 4) {
//         if (/^\d+$/.test(value) && textItem.flag !== 1) {
//           textItem.flag = 1;
//           result.quantity = value;
//         }

//         // 金额，只有当还没设置时才赋值
//         if (/^[¥￥]?-?[\d.]+$/.test(value) && textItem.flag !== 1) {
//           textItem.flag = 1;
//           result.price = value;
//         }
//       }

//       // 金额
//       if (index === row.length - 3 && /^[¥￥]?-?[\d.]+$/.test(value)) {
//         result.amount = value;
//       }

//       // 税率
//       if (index === row.length - 2 && value.includes("%")) {
//         result.tax_rate = value;
//       }

//       // 税额
//       if (index === row.length - 1 && /^[¥￥]?-?[\d.]+$/.test(value)) {
//         result.tax = value;
//       }
//     });

//     invoice.items.push(result);
//   }

//   // 如果没有提取到有效的商品项，添加一个默认项
//   if (invoice.items.length === 0) {
//     invoice.items.push({
//       name: "未能识别的商品",
//       quantity: "0",
//       price: "0",
//       amount: "0",
//       tax_rate: "0",
//       tax: "0",
//     });
//   }
// }

/**
 * 提取合计金额和合计税额
 * @param textItems 所有文本项
 * @param invoice 发票对象
 */
// function extractTotalAmountAndTax(textItems: TextItem[], invoice: Invoice) {
//   console.log('textItems', textItems);
    
//   const candidateItem = textItems.find((item) => item.text === "计" || item.text === "合计")!;
//   console.log('合计', candidateItem);
  
//     const sameLineItems = textItems
//       .filter(
//         (t) =>
//           Math.abs(t.y - candidateItem.y) < 5 &&
//           t.x > candidateItem.x
//       )
//       .sort((a, b) => a.x - b.x);
//       console.log('合计', sameLineItems);
      
//     const values: string[] = [];

//     for (let i = 0; i < sameLineItems.length; i++) {
//       const text = sameLineItems[i].text;
//       if (/^[¥￥]?\d+(\.\d+)?$/.test(text)) {
//         values.push(text.replace(/^[¥￥]/, ""));
//       } else if (
//         text === "¥" &&
//         i + 1 < sameLineItems.length &&
//         /^\d+(\.\d+)?$/.test(sameLineItems[i + 1].text)
//       ) {
//         values.push(sameLineItems[i + 1].text);
//         i++; // 跳过下一个已处理
//       }
//     }
//     console.log('values', values);
    
//     if (values.length >= 1) {
//       invoice.total_amount =values[0];
//     }
  
// }

/**
 * 根据通用发票格式解析发票信息
 * @param textItems 文本位置信息
 * @param invoice 发票对象
 * @param pageIndex 页码索引
 * @returns 解析后的发票信息
 */
// function parseGenericFapiao(
//   textItems: TextItem[],
//   invoice: Invoice,
//   pageIndex: number
// ): Invoice {
//   // 设置页面索引
//   invoice.index = pageIndex + 1;

//   // 根据关键词提取标题
//   const titleItem = textItems.find((item) => /电[⼦子]\S*/.test(item.text));
//   // console.log("titleItem", titleItem);

//   if (titleItem) {
//     if (titleItem.text.includes("增值")) {
//       invoice.title = `${titleItem.text} (第${pageIndex + 1}页)`;
//       invoice.invoice_type = "增值税电子普通发票";
//     } else {
//       invoice.title = `${titleItem.text} (第${pageIndex + 1}页)`;
//       invoice.invoice_type = "普通发票";
//     }

//     console.log(invoice.title);
//   } else {
//     // 如果没有找到标题，至少设置页码信息
//     invoice.title = `发票 (第${pageIndex + 1}页)`;
//   }

//   // 提取发票代码
//   invoice.code = extractNearbyText(textItems, /发票代码[:：]?/, "right", 100);

//   // 提取发票号码
//   invoice.number = extractNearbyText(textItems, /发票号码[:：]?/, "right", 100);

//   // 提取开票日期
//   invoice.date = extractNearbyText(textItems, /开票日期[:：]?/, "right", 150);

//   // 提取校验码
//   invoice.checksum = extractNearbyText(
//     textItems,
//     /^校验码[:：]|^码[:：]/,
//     "right",
//     250
//   );

//   // 提取购买方信息
//   extractPartyInfo(textItems, invoice, "购", false);

//   // 提取销售方信息
//   extractPartyInfo(textItems, invoice, "销", true);

//   // 提取开票人、收款人、复核人
//   invoice.drawer = extractNearbyText(
//     textItems,
//     /^开票.{0,1}[:：]$/,
//     "right",
//     100
//   );
//   invoice.payee = extractNearbyText(
//     textItems,
//     /^收款.{0,1}[:：]$/,
//     "right",
//     100
//   );
//   invoice.reviewer = extractNearbyText(
//     textItems,
//     /^复核.{0,1}[:：]$/,
//     "right",
//     100
//   );

//   // 提取备注
//   extractRemarkInfo(textItems, invoice);

//   // 提取商品信息
//   extractInvoiceItems(textItems, invoice);

//   // // 提取合计金额和合计税额
//   extractTotalAmountAndTax(textItems, invoice);
  
//   // 提取合计税价
//   invoice.total_tax = extractNearbyText(textItems, /[（(]?小写[)）]?/, "right", 100).replace(/^[¥￥]/, "");

//   return invoice;
// }
