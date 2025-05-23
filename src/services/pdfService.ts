import { invoke } from "@tauri-apps/api/core";
import { parsePdfFile, Invoice, ProgressCallback } from "../utils/pdfParser";

// 处理状态接口
export interface ProcessingStats {
  totalAmount: number;
  totalAmountTax: number;
  invoiceCount: number;
  duplicateCount: number;
  successCount: number;
  failCount: number;
  currentProgress: number; // 添加当前进度字段
}

/**
 * 发票处理服务
 */
class PdfService {
  // 存储发票数据
  private invoices: Invoice[] = [];
  // 处理状态
  private stats: ProcessingStats = {
    totalAmount: 0,
    totalAmountTax: 0,
    invoiceCount: 0,
    duplicateCount: 0,
    successCount: 0,
    failCount: 0,
    currentProgress: 0,
  };
  // 处理状态
  private isProcessing = false;
  // 总文件数
  private totalFiles = 0;
  // 当前处理的文件索引
  private currentFileIndex = 0;

  /**
   * 解析PDF文件
   * @param files PDF文件列表
   * @returns 处理状态
   */
  async parsePdfFiles(files: File[]): Promise<ProcessingStats> {
    if (this.isProcessing) {
      throw new Error("已经有一个解析进程在运行");
    }

    this.isProcessing = true;
    this.invoices = [];
    this.resetStats();
    
    // 设置文件总数和当前索引
    this.totalFiles = files.length;
    this.currentFileIndex = 0;
    
    // 立即设置进度为1%，确保进度条开始显示
    this.stats.currentProgress = 1;

    try {
      // 处理每个文件
      let index = 1;
      let successCount = 0;
      let duplicateCount = 0;
      let failCount = 0;
      let totalAmount = 0;
      let totalAmountTax = 0;

      for (const file of files) {
        // 检查是否应该停止处理
        if (!this.isProcessing) {
          console.log("处理已停止，不再继续解析文件");
          break;
        }
        
        // 更新当前处理的文件索引
        this.currentFileIndex++;
        // console.log(`开始处理第 ${this.currentFileIndex}/${this.totalFiles} 个文件`);

        try {
          // console.log(`开始处理文件: ${file.name}`);
          
          // 进度回调函数，用于更新当前文件的解析进度
          const progressCallback: ProgressCallback = (current, total) => {
            // 忽略0进度的报告，避免闪烁
            if (current === 0) return;
            
            // 计算总体进度：已完成的文件 + 当前文件的进度比例
            const completedFilesProgress = ((this.currentFileIndex - 1) / this.totalFiles) * 100;
            // 确保当前文件进度至少为1%，避免闪烁
            const currentFileProgress = Math.max(1, (current / total)) * (100 / this.totalFiles);
            // 计算总进度，确保不会低于之前的进度
            const totalProgress = Math.max(
              this.stats.currentProgress,
              Math.min(99, completedFilesProgress + currentFileProgress)
            );
            
            // 只有当新进度大于当前进度时才更新，避免进度回退
            if (totalProgress > this.stats.currentProgress) {
              // 更新进度
              this.stats.currentProgress = Math.floor(totalProgress);
              // console.log(`文件 ${this.currentFileIndex}/${this.totalFiles}, 当前文件进度: ${current}/${total}, 总进度: ${this.stats.currentProgress}%`);
            }
          };
          
          // 使用前端PDF.js解析文本并交给后端处理
          const invoices = await parsePdfFile(file, progressCallback);
          // console.log(`文件解析完成: ${file.name}, 共 ${invoices.length} 页发票`);

          // 处理每个发票
          for (const invoice of invoices) {
            // 检查是否应该停止处理
            if (!this.isProcessing) {
              console.log("处理已停止，不再继续处理剩余发票");
              break;
            }
            
            // 设置序号
            invoice.index = index;

            // 检查是否重复（根据发票号码和发票代码来检查）
            let isDuplicate = false;
            let duplicateWithIndex = 0;

            // 只有当发票代码和号码不是空或未解析时才检查重复性
            if (
              invoice.code &&
              invoice.code !== "未能解析" &&
              invoice.number &&
              !invoice.number.startsWith("文件：")
            ) {
              for (const existingInvoice of this.invoices) {
                if (
                  existingInvoice.number === invoice.number &&
                  existingInvoice.code === invoice.code
                ) {
                  isDuplicate = true;
                  duplicateWithIndex = existingInvoice.index;
                  break;
                }
              }
            }

            if (invoice.status === "解析失败") {
              // 如果是解析失败状态，保持该状态
              failCount++;
            } else if (isDuplicate) {
              duplicateCount++;
              invoice.status = "重复";
              invoice.duplicate_info = `与第${duplicateWithIndex}个发票重复`;
            } else {
              successCount++;
              invoice.status = "正常";
              
              // 解析金额和税额，用于统计
              const amount = parseFloat(invoice.total_amount) || 0;
              const tax = parseFloat(invoice.total_amount_tax) || 0;
              totalAmount += amount;
              totalAmountTax += tax;
            }

            this.invoices.push(invoice);
            index++;
            
            // 每添加一个发票后立即更新统计信息，便于跟踪进度
            this.updateStats(
              successCount,
              duplicateCount,
              failCount,
              totalAmount,
              totalAmountTax,
              this.invoices.length
            );
          }
        } catch (error) {
          console.error("解析文件失败:", error);
          failCount++;

          // 创建解析失败的发票记录
          const failedInvoice: Invoice = {
            filename: `${file.name}#解析失败`,
            index: index,
            title: "解析失败的发票",
            invoice_type: "未知",
            code: "未能解析",
            number: `文件：${file.name}`,
            date: "未知",
            checksum: "",
            machine_number: "",
            password: "",
            remark: "该发票无法自动解析",
            buyer: {
              name: "未知",
              tax_code: "",
              address_phone: "",
              bank_account: "",
            },
            seller: {
              name: "未知",
              tax_code: "",
              address_phone: "",
              bank_account: "",
            },
            items: [
              {
                name: "无法识别的商品",
                quantity: "0",
                price: "0",
                amount: "0",
                tax_rate: "0",
                tax: "0",
              },
            ],
            total_amount: "0.00",
            total_tax: "0.00",
            total_amount_tax: "0.00",
            payee: "",
            reviewer: "",
            drawer: "",
            status: "解析失败",
            duplicate_info: "",
          };

          this.invoices.push(failedInvoice);
          index++;
          
          // 解析失败后也要更新统计信息
          this.updateStats(
            successCount,
            duplicateCount,
            failCount,
            totalAmount,
            totalAmountTax,
            this.invoices.length
          );
        }
      }
      
      // 全部文件处理完成，设置进度为100%
      this.stats.currentProgress = 100;
      // console.log("所有文件处理完成，进度设为100%");

      return this.stats;
    } catch (error) {
      console.error("PDF处理过程中发生错误:", error);
      throw error;
    } finally {
      // console.log("PDF处理已完成或停止，结束处理状态");
      this.isProcessing = false;
    }
  }

  /**
   * 获取所有发票
   */
  getInvoices(): Invoice[] {
    return [...this.invoices];
  }

  /**
   * 获取处理状态
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * 获取发票详情
   * @param filename 文件名
   */
  getInvoiceDetail(filename: string): Invoice | null {
    return this.invoices.find((inv) => inv.filename === filename) || null;
  }

  /**
   * 停止处理
   */
  stopProcessing(): void {
    // console.log("接收到停止处理请求");
    this.isProcessing = false;
  }

  /**
   * 清除数据
   */
  clearData(): void {
    // 首先停止所有处理
    this.isProcessing = false;
    
    // 重置数据
    this.invoices = [];
    this.resetStats();
    
    // 重置其他状态变量
    this.totalFiles = 0;
    this.currentFileIndex = 0;
    
    // 强制将进度设为0
    this.stats.currentProgress = 0;
    
    // console.log("PdfService: 所有数据已重置");
  }

  /**
   * 导出结果到Excel
   * @param options 导出配置选项
   */
  async exportResults(options: {
    path: string;
    filename: string;
    exportWithDetails: boolean;
    exportFields?: string[];
    invoices: any[];
  }): Promise<void> {
    if (!options.path) {
      throw new Error("未指定导出路径");
    }

    if (options.invoices.length === 0) {
      throw new Error("没有可导出的发票数据");
    }

    // 调用Rust后端导出Excel
    try {
      // 处理invoices数据，确保结构与后端一致
      const processedInvoices = options.invoices.map(invoice => {
        // 确保buyer和seller对象符合后端期望的格式
        let buyer = {
          name: "",
          tax_code: "",
          address_phone: "",
          bank_account: ""
        };
        
        let seller = {
          name: "",
          tax_code: "",
          address_phone: "",
          bank_account: ""
        };
        
        // 处理buyer信息
        if (invoice.buyer) {
          buyer = {
            name: invoice.buyer.name || "",
            tax_code: invoice.buyer.taxCode || invoice.buyer.tax_code || "",
            address_phone: invoice.buyer.addressPhone || invoice.buyer.address_phone || "",
            bank_account: invoice.buyer.bankAccount || invoice.buyer.bank_account || ""
          };
        }
        
        // 处理seller信息
        if (invoice.seller) {
          seller = {
            name: invoice.seller.name || "",
            tax_code: invoice.seller.taxCode || invoice.seller.tax_code || "",
            address_phone: invoice.seller.addressPhone || invoice.seller.address_phone || "",
            bank_account: invoice.seller.bankAccount || invoice.seller.bank_account || ""
          };
        }
        
        // 创建一个新的完整发票对象，映射所有字段
        const processedInvoice: any = {
          // 基本字段
          filename: invoice.filename,
          index: invoice.index,
          title: invoice.title || "",
          // 确保type字段存在且有值
          type: invoice.type || invoice.invoice_type || "普通发票",
          code: invoice.code || "",
          number: invoice.number || "",
          date: invoice.date || "",
          checksum: invoice.checksum || invoice.machineNumber || "",
          machine_number: invoice.machineNumber || invoice.machine_number || "",
          password: invoice.password || "",
          remark: invoice.remark || "",
          
          // 金额相关
          total_amount: invoice.totalAmount || invoice.total_amount || "0.00",
          total_tax: invoice.totalTax || invoice.total_tax || "0.00",
          total_amount_tax: invoice.totalAmountTax || invoice.total_amount_tax || "0.00",
          
          // 人员信息
          payee: invoice.payee || "",
          reviewer: invoice.reviewer || "",
          drawer: invoice.drawer || "",
          
          // 状态信息
          status: invoice.status || "待统计",
          duplicate_info: invoice.duplicateInfo || invoice.duplicate_info || "",
          
          // 买卖方信息
          buyer,
          seller,
        };
        
        // 处理items数组
        if (invoice.details || invoice.items) {
          const items = invoice.details || invoice.items || [];
          processedInvoice.items = items.map((item: any) => ({
            name: item.name || "",
            quantity: item.quantity || "0",
            price: item.price || "0",
            amount: item.amount || "0",
            tax_rate: item.tax_rate || item.taxRate || "0",
            tax: item.tax || "0",
          }));
        } else {
          processedInvoice.items = [];
        }
        
        return processedInvoice;
      });
      
      // 先将处理好的发票数据发送到后端
      await invoke("set_invoices", { invoices: processedInvoices });

      // 然后导出Excel
      await invoke("export_results", { 
        path: options.path,
        filename: options.filename || "发票数据汇总",
        exportWithDetails: options.exportWithDetails,
        exportFields: options.exportFields
      });
    } catch (error) {
      console.error("导出失败:", error);
      throw error;
    }
  }

  /**
   * 重置统计信息
   */
  private resetStats(): void {
    this.stats = {
      totalAmount: 0,
      totalAmountTax: 0,
      invoiceCount: 0,
      duplicateCount: 0,
      successCount: 0,
      failCount: 0,
      currentProgress: 0,
    };
  }

  /**
   * 更新统计信息
   */
  private updateStats(
    successCount: number,
    duplicateCount: number,
    failCount: number,
    totalAmount: number,
    totalAmountTax: number,
    invoiceCount: number
  ): void {
    this.stats = {
      totalAmount: totalAmount,
      totalAmountTax: totalAmountTax,
      invoiceCount: invoiceCount,
      duplicateCount: duplicateCount,
      successCount: successCount,
      failCount: failCount,
      currentProgress: this.stats.currentProgress, // 保持当前进度不变
    };
  }

  /**
   * 获取处理状态
   * @returns 是否正在处理
   */
  getProcessingStatus(): boolean {
    return this.isProcessing;
  }
}

// 导出单例服务
export const pdfService = new PdfService();
