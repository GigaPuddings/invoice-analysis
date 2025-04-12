import {
  Button,
  Input,
  Table,
  Card,
  Typography,
  Statistic,
  Progress,
  message,
  Space,
  Divider,
  Tag,
  Empty,
  Tooltip,
  Modal,
  Checkbox,
  Radio,
} from "antd";
import {
  UploadOutlined,
  FileSearchOutlined,
  ExportOutlined,
  FilePdfOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import React, { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { checkPdfJsEnvironment } from "@/utils/pdfjs-checker";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import type { SorterResult as AntdSorterResult, TableCurrentDataSource } from "antd/es/table/interface";
import type { FilterValue } from "antd/es/table/interface";
import PdfPreview from "@/components/PdfPreview";
import { pdfService } from "@/services/pdfService";
import { InvoiceDetail } from "../..";
import { invoke } from "@tauri-apps/api/core";

const { Title, Text } = Typography;

interface ConfigPanelProps {
  selectedInvoice: InvoiceDetail | null;
  setSelectedInvoice: React.Dispatch<
    React.SetStateAction<InvoiceDetail | null>
  >;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({
  selectedInvoice,
  setSelectedInvoice,
}) => {
  // 发票状态类型
  type InvoiceStatus = "待统计" | "正常" | "重复" | "解析失败";

  // 发票基本信息类型
  interface InvoiceBasic {
    filename: string;
    title?: string;
    index: number;
    code: string;
    number: string;
    date: string;
    totalAmount: string;
    totalTax: string;
    totalAmountTax: string;
    remark: string;
    status: InvoiceStatus;
    duplicateInfo: string;
    type: string;
    invoice_type?: string;
    payee?: string;
    reviewer?: string;
    drawer?: string;
    details?: Array<{
      name: string;
      quantity: string;
      price: string;
      amount: string;
      tax_rate: string;
      tax: string;
    }>;
  }

  // 表格排序类型定义
  // interface SorterResult<T> {
  //   column?: { 
  //     dataIndex: string;
  //     key: string;
  //   };
  //   order?: 'ascend' | 'descend' | null;
  //   field?: string;
  //   columnKey?: string;
  // }

  const [outputPath, setOutputPath] = useState<string>("");
  const [outputFilename, setOutputFilename] = useState<string>("发票数据汇总");
  const [invoicePath, setInvoicePath] = useState<string>("");
  const [processing, setProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messageApi, contextHolder] = message.useMessage();

  // 发票列表状态
  const [invoices, setInvoices] = useState<InvoiceBasic[]>([]);
  // 排序和选择相关状态
  const [sorterState, setSorterState] = useState<AntdSorterResult<InvoiceBasic> | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [exportModalVisible, setExportModalVisible] = useState<boolean>(false);
  const [exportWithDetails, setExportWithDetails] = useState<boolean>(false);
  
  // 导出字段选择状态
  const [exportFields, setExportFields] = useState<string[]>([
    "序号", "文件名", "状态", "发票代码", "发票号码", "开票日期", 
    "购买方名称", "购买方税号", "购买方地址电话", "购买方开户行账号", 
    "销售方名称", "销售方税号", "销售方地址电话", "销售方开户行账号", 
    "收款人", "复核人", "开票人",
    "金额", "税额", "价税合计", "备注", "重复信息"
  ]);
  
  // 可用的导出字段列表
  const availableExportFields = [
    "序号", "文件名", "状态", "发票代码", "发票号码", "开票日期", 
    "购买方名称", "购买方税号", "购买方地址电话", "购买方开户行账号", 
    "销售方名称", "销售方税号", "销售方地址电话", "销售方开户行账号", 
    "收款人", "复核人", "开票人",
    "金额", "税额", "价税合计", "备注", "重复信息"
  ];
  
  // 添加展开行的状态控制
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  // 统计结果状态对象（确保与 pdfService 中定义的完全一致）
  interface StatsType {
    totalAmount: number;
    totalAmountTax: number;
    invoiceCount: number;
    duplicateCount: number;
    successCount: number;
    failCount: number;
    currentProgress: number;
  }

  // 统计结果状态
  const [stats, setStats] = useState<StatsType>({
    totalAmount: 0,
    totalAmountTax: 0,
    invoiceCount: 0,
    duplicateCount: 0,
    successCount: 0,
    failCount: 0,
    currentProgress: 0,
  });

  // 添加PDF.js环境检查状态
  const [pdfJsCheckStatus, setPdfJsCheckStatus] = useState<string | null>(null);

  // 添加PDF预览相关状态
  const [pdfPreviewVisible, setPdfPreviewVisible] = useState<boolean>(false);
  const [selectedPdfFile, setSelectedPdfFile] = useState<string>("");

  // 组件加载时检查PDF.js环境
  useEffect(() => {
    async function checkPdfJs() {
      try {
        console.log("开始检查PDF.js环境");
        const result = await checkPdfJsEnvironment();
        if (result.success) {
          console.log("PDF.js环境检查通过:", result.message);
          // 环境检查通过，无需显示状态
          setPdfJsCheckStatus(null);
        } else {
          console.error("PDF.js环境检查失败:", result.message);
          // 环境检查失败，显示错误信息
          setPdfJsCheckStatus(result.message);
          messageApi.error({
            content: "PDF.js环境检查失败: " + result.message,
            duration: 5,
          });
        }
      } catch (error) {
        console.error("PDF.js环境检查异常:", error);
        setPdfJsCheckStatus(`检查PDF.js环境时发生错误: ${error}`);
        messageApi.error({
          content: "PDF.js环境检查异常: " + String(error),
          duration: 5,
        });
      }
    }

    // 执行环境检查
    checkPdfJs();
  }, [messageApi]);

  // 选择输出Excel文件路径
  const selectOutputPath = async () => {
    try {
      const selected = await invoke<string>("select_output_path");
      setOutputPath(selected);
      messageApi.success({
        content: "已选择输出文件: " + selected,
        duration: 3,
      });
    } catch (error) {
      messageApi.error({
        content: "选择文件失败: " + String(error),
        duration: 3,
      });
    }
  };

  // 选择发票文件
  const selectInvoiceFiles = async () => {
    try {
      // 打开文件选择器
      const selectedFiles = await open({
        multiple: true,
        filters: [
          {
            name: "PDF文件",
            extensions: ["pdf"],
          },
        ],
      });

      if (!selectedFiles || selectedFiles.length === 0) {
        return;
      }

      // 更新文件路径显示（取第一个文件的目录）
      if (Array.isArray(selectedFiles) && selectedFiles.length > 0) {
        setInvoicePath(`已选择 ${selectedFiles.length} 个文件`);

        // 将文件路径存储在fileInputRef中，以便后续处理
        if (fileInputRef.current) {
          fileInputRef.current.dataset.files = JSON.stringify(selectedFiles);
        }

        messageApi.success({
          content: `已选择 ${selectedFiles.length} 个发票文件`,
          duration: 3,
        });
      }
    } catch (error) {
      messageApi.error({
        content: "选择文件失败: " + String(error),
        duration: 3,
      });
    }
  };

  // 进度更新逻辑
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (processing) {
      // 确保只显示大于0的进度值
      if (progress === 0) {
        setProgress(1); // 从1%开始而不是0%，避免闪现
      }

      // 创建定时器检查当前进度
      intervalId = setInterval(() => {
        try {
          // 获取当前状态
          const currentStats = pdfService.getStats();
          const currentInvoices = pdfService.getInvoices();

          // 强制设置进度为至少1%，确保进度条显示
          let displayProgress = Math.max(1, currentStats.currentProgress);

          // 当进度变化时更新UI
          if (displayProgress !== progress && displayProgress > 0) {
            console.log("更新进度:", displayProgress);
            setProgress(displayProgress);
          }

          // 更新状态数据
          setStats({
            totalAmount: currentStats.totalAmount,
            totalAmountTax: currentStats.totalAmountTax,
            invoiceCount: currentStats.invoiceCount,
            duplicateCount: currentStats.duplicateCount,
            successCount: currentStats.successCount,
            failCount: currentStats.failCount,
            currentProgress: currentStats.currentProgress,
          });
          // 更新发票列表
          setInvoices(
            currentInvoices.map((inv) => ({
              filename: inv.filename,
              title: inv.title,
              index: inv.index,
              details: inv.items,
              code: inv.code,
              number: inv.number,
              date: inv.date,
              totalAmount: inv.total_amount,
              totalTax: inv.total_tax,
              totalAmountTax: inv.total_amount_tax,
              remark: inv.remark,
              status: inv.status as InvoiceStatus,
              duplicateInfo: inv.duplicate_info,
              type: inv.invoice_type || "", // 确保有type字段
              invoice_type: inv.invoice_type || "", // 同时保留invoice_type字段，方便调试
              payee: inv.payee || "",
              reviewer: inv.reviewer || "",
              drawer: inv.drawer || ""
            }))
          );

          // 如果处理已完成（进度100%），停止处理
          if (currentStats.currentProgress >= 100) {
            setProcessing(false);
            setProgress(100);
          }
        } catch (error) {
          console.error("进度更新错误:", error);
        }
      }, 100); // 更频繁地更新进度
    } else if (progress > 0 && progress < 100) {
      // 如果停止处理且进度未完成，看看是否是因为清除了数据
      if (pdfService.getStats().invoiceCount === 0) {
        // 如果没有数据，说明是清除操作，直接重置进度
        setProgress(0);
      } else {
        // 否则是停止操作，显示完成状态
        setProgress(100);

        // 短暂延迟后重置进度
        setTimeout(() => {
          setProgress(0);
        }, 2000); // 延长显示时间，以便用户能够看到完成状态
      }
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [processing, progress]);

  // 开始解析
  const startProcessing = async () => {
    if (!outputPath) {
      messageApi.error({
        content: "请选择输出文件路径",
        duration: 3,
      });
      return;
    }

    // 获取选择的文件
    if (!fileInputRef.current || !fileInputRef.current.dataset.files) {
      messageApi.error({
        content: "请选择发票文件",
        duration: 3,
      });
      return;
    }

    // 强制先重置进度条和清除数据
    setProgress(0);
    pdfService.clearData();

    // 短暂延迟确保重置已完成
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 先设置处理状态，让进度更新逻辑生效
    setProcessing(true);

    try {
      // 获取文件路径列表
      const filePaths = JSON.parse(fileInputRef.current.dataset.files);

      if (!Array.isArray(filePaths) || filePaths.length === 0) {
        throw new Error("未选择任何文件");
      }

      // 读取文件内容
      const filePromises = filePaths.map(async (path: string) => {
        // 使用Tauri API读取文件
        const fileBytes = await invoke<number[]>("read_file_to_bytes", {
          path,
        });
        const fileArrayBuffer = new Uint8Array(fileBytes).buffer;

        // 从路径中提取文件名
        const filename = path.substring(path.lastIndexOf("\\") + 1);

        // 创建File对象
        return new File([fileArrayBuffer], filename, {
          type: "application/pdf",
        });
      });

      const files = await Promise.all(filePromises);

      // 使用前端PDF解析服务处理文件
      await pdfService.parsePdfFiles(files);

      // 处理完成，更新一次最终状态
      const finalStats = pdfService.getStats();
      setStats({
        totalAmount: finalStats.totalAmount,
        totalAmountTax: finalStats.totalAmountTax,
        invoiceCount: finalStats.invoiceCount,
        duplicateCount: finalStats.duplicateCount,
        successCount: finalStats.successCount,
        failCount: finalStats.failCount,
        currentProgress: finalStats.currentProgress,
      });

      // 设置进度为100%
      setProgress(100);

      messageApi.success({
        content: `成功解析了${finalStats.successCount}份发票`,
        duration: 3,
      });
    } catch (error) {
      messageApi.error({
        content: "解析失败: " + String(error),
        duration: 3,
      });
      setProcessing(false);
      // 错误时重置进度，延迟一下避免闪烁
      setTimeout(() => {
        setProgress(0);
      }, 500);
    }
  };

  // 停止解析
  const stopProcessing = async () => {
    try {
      // 先更新UI状态，提供即时反馈
      setProcessing(false);

      // 然后通知服务停止处理
      pdfService.stopProcessing();

      messageApi.warning({
        content: "解析过程已停止",
        duration: 3,
      });
    } catch (error) {
      messageApi.error({
        content: "停止失败: " + String(error),
        duration: 3,
      });
    }
  };

  // 导出结果
  const exportResults = async () => {
    if (!outputPath) {
      messageApi.error({
        content: "请选择输出文件路径",
        duration: 3,
      });
      return;
    }

    // 显示导出配置弹窗
    setExportModalVisible(true);
  };

  // 获取排序后的数据
  const getSortedData = () => {
    if (!sorterState || !sorterState.order) {
      return invoices;
    }

    // 创建排序函数
    const getSortFunction = () => {
      const field = sorterState.field || "";
      
      if (field === "status") {
        const statusOrder = {"正常": 1, "重复": 2, "解析失败": 3, "待统计": 4};
        return (a: InvoiceBasic, b: InvoiceBasic) => 
          statusOrder[a.status] - statusOrder[b.status];
      }
      
      if (field === "date") {
        return (a: InvoiceBasic, b: InvoiceBasic) => {
          const parseDate = (dateStr: string) => {
            if (!dateStr) return new Date(0);
            const cleanDate = dateStr.replace(/[年月]/g, '.').replace(/日/g, '');
            const [year, month, day] = cleanDate.split('.');
            return new Date(Number(year), Number(month) - 1, Number(day));
          };
          
          const dateA = parseDate(a.date);
          const dateB = parseDate(b.date);
          return dateA.getTime() - dateB.getTime();
        };
      }
      
      if (["totalAmount", "totalTax", "totalAmountTax"].includes(String(field))) {
        return (a: InvoiceBasic, b: InvoiceBasic) => {
          const valueA = parseFloat(a[field as keyof InvoiceBasic] as string) || 0;
          const valueB = parseFloat(b[field as keyof InvoiceBasic] as string) || 0;
          return valueA - valueB;
        };
      }
      
      // 默认返回比较函数
      return (a: InvoiceBasic, b: InvoiceBasic) => {
        const valueA = a[field as keyof InvoiceBasic] || '';
        const valueB = b[field as keyof InvoiceBasic] || '';
        return String(valueA).localeCompare(String(valueB));
      };
    };
    
    // 复制数组并应用排序
    const sortFunc = getSortFunction();
    const sortedData = [...invoices].sort(sortFunc);
    
    return sorterState.order === 'descend' ? sortedData.reverse() : sortedData;
  };

  // 确定导出
  const handleExportConfirm = async () => {
    setExportModalVisible(false);
    
    try {
      // 获取要导出的数据
      let dataToExport;
      
      if (selectedRowKeys.length > 0) {
        // 如果有选择，则只导出选中的数据
        dataToExport = getSortedData().filter((invoice) => 
          selectedRowKeys.includes(invoice.filename)
        );
      } else {
        // 否则导出所有数据（按照当前排序）
        dataToExport = getSortedData();
      }
      
      if (dataToExport.length === 0) {
        messageApi.warning({
          content: "没有可导出的数据",
          duration: 3,
        });
        return;
      }
      
      // 获取所有发票的完整详情，确保有正确的buyer和seller信息
      const processedData = await Promise.all(dataToExport.map(async (invoice) => {
        // 从pdfService获取完整的发票详情
        const detail = pdfService.getInvoiceDetail(invoice.filename);
        
        if (!detail) {
          // 如果找不到详情，使用现有的数据
          return {
            ...invoice,
            type: invoice.type || "普通发票",
            buyer: {
              name: "",
              tax_code: "",
              address_phone: "",
              bank_account: ""
            },
            seller: {
              name: "",
              tax_code: "",
              address_phone: "",
              bank_account: ""
            },
            payee: "",
            reviewer: "",
            drawer: ""
          };
        }
        
        // 使用详情中的完整数据
        return {
          ...invoice,
          type: invoice.type || detail.invoice_type || "普通发票",
          buyer: {
            name: detail.buyer.name || "",
            tax_code: detail.buyer.tax_code || "",
            address_phone: detail.buyer.address_phone || "",
            bank_account: detail.buyer.bank_account || ""
          },
          seller: {
            name: detail.seller.name || "",
            tax_code: detail.seller.tax_code || "",
            address_phone: detail.seller.address_phone || "",
            bank_account: detail.seller.bank_account || ""
          },
          payee: detail.payee || "",
          reviewer: detail.reviewer || "",
          drawer: detail.drawer || ""
        };
      }));
      
      // 准备导出参数
      const exportOptions = {
        path: outputPath,
        filename: outputFilename,
        exportWithDetails: exportWithDetails,
        exportFields: exportFields,
        invoices: processedData,
      };
      
      // 将处理好的发票数据发送到后端
      await pdfService.exportResults(exportOptions);

      messageApi.success({
        content: `结果已导出至 ${outputPath}/${outputFilename}.xlsx`,
        duration: 3,
      });
    } catch (error) {
      messageApi.error({
        content: "导出失败: " + String(error),
        duration: 3,
      });
    }
  };

  // 查看发票详情
  const viewInvoiceDetail = async (filename: string) => {
    try {
      const detail = pdfService.getInvoiceDetail(filename);

      if (!detail) {
        throw new Error(`找不到发票：${filename}`);
      }

      setSelectedInvoice({
        filename: detail.filename,
        index: detail.index,
        title: detail.title,
        code: detail.code,
        number: detail.number,
        date: detail.date,
        checksum: detail.checksum,
        machineNumber: detail.machine_number,
        password: detail.password,
        remark: detail.remark,
        buyer: {
          name: detail.buyer.name,
          taxCode: detail.buyer.tax_code,
          addressPhone: detail.buyer.address_phone,
          bankAccount: detail.buyer.bank_account,
        },
        seller: {
          name: detail.seller.name,
          taxCode: detail.seller.tax_code,
          addressPhone: detail.seller.address_phone,
          bankAccount: detail.seller.bank_account,
        },
        items: detail.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          amount: item.amount,
          taxRate: item.tax_rate,
          tax: item.tax,
        })),
        payee: detail.payee,
        reviewer: detail.reviewer,
        drawer: detail.drawer,
        status: detail.status,
        duplicateInfo: detail.duplicate_info,
      });
    } catch (error) {
      messageApi.error({
        content: "获取详情失败: " + String(error),
        duration: 3,
      });
    }
  };

  // 清除数据
  const clearData = async () => {
    try {
      // 立即将进度设为0
      setProgress(0);

      // 确保处理已停止
      setProcessing(false);

      // 清空服务层数据
      pdfService.clearData();

      // 清空本地状态
      setInvoices([]);
      setStats({
        totalAmount: 0,
        totalAmountTax: 0,
        invoiceCount: 0,
        duplicateCount: 0,
        successCount: 0,
        failCount: 0,
        currentProgress: 0,
      });
      setSelectedInvoice(null);

      messageApi.success({
        content: "所有数据已重置",
        duration: 3,
      });
    } catch (error) {
      messageApi.error({
        content: "清除失败: " + String(error),
        duration: 3,
      });
    }
  };

  // 表格列定义
  const columns: ColumnsType<InvoiceBasic> = [
    {
      title: "序号",
      dataIndex: "index",
      key: "index",
      width: 65,
      fixed: "left",
      align: "center",
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 90,
      align: "center",
      showSorterTooltip: false,
      sorter: (a, b) => {
        const statusOrder = {"正常": 1, "重复": 2, "解析失败": 3, "待统计": 4};
        return statusOrder[a.status] - statusOrder[b.status];
      },
      render: (status: string) => {
        let color = "default";
        if (status === "正常") color = "success";
        else if (status === "重复") color = "error";
        else if (status === "解析失败") color = "warning";

        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: "发票号码",
      dataIndex: "number",
      key: "number",
      width: 200,
      align: "center",
      ellipsis: true,
      // render: (text: string, record: InvoiceBasic) => (
      //   <a 
      //     onClick={(e) => {
      //       e.stopPropagation();
      //       openPdfFile(record.filename);
      //     }}
      //   >
      //     {text}
      //   </a>
      // )
    },
    {
      title: "开票日期",
      dataIndex: "date",
      key: "date",
      width: 160,
      align: "center",
      ellipsis: true,
      showSorterTooltip: false,
      sorter: (a, b) => {
        const parseDate = (dateStr: string) => {
          if (!dateStr) return new Date(0);
          const cleanDate = dateStr.replace(/[年月]/g, '.').replace(/日/g, '');
          const [year, month, day] = cleanDate.split('.');
          return new Date(Number(year), Number(month) - 1, Number(day));
        };
        
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        return dateA.getTime() - dateB.getTime();
      },
    },
    {
      title: "金额",
      dataIndex: "totalAmount",
      key: "totalAmount",
      width: 120,
      align: "center",
      ellipsis: true,
      showSorterTooltip: false,
      sorter: (a, b) => {
        const amountA = parseFloat(a.totalAmount) || 0;
        const amountB = parseFloat(b.totalAmount) || 0;
        return amountA - amountB;
      },
    },
    {
      title: "税额",
      dataIndex: "totalTax",
      key: "totalTax",
      width: 120,
      align: "center",
      ellipsis: true,
      showSorterTooltip: false,
      sorter: (a, b) => {
        const taxA = parseFloat(a.totalTax) || 0;
        const taxB = parseFloat(b.totalTax) || 0;
        return taxA - taxB;
      },
    },
    {
      title: "价税合计",
      dataIndex: "totalAmountTax",
      key: "totalAmountTax",
      width: 120,
      align: "center",
      ellipsis: true,
      showSorterTooltip: false,
      sorter: (a, b) => {
        const totalA = parseFloat(a.totalAmountTax) || 0;
        const totalB = parseFloat(b.totalAmountTax) || 0;
        return totalA - totalB;
      },
    },
    {
      title: "重复信息",
      dataIndex: "duplicateInfo",
      key: "duplicateInfo",
      width: 140,
      ellipsis: true,
    },
    {
      title: "操作",
      key: "action",
      width: 70,
      align: "center",
      fixed: "right",
      render: (_, record) => (
        // openPdfFile(record.filename);
        <>
          <Tooltip title="打开文件">
          <Button
            type="text"
            icon={<FilePdfOutlined />}
            onClick={(e) => {
              e.stopPropagation(); // 防止触发行点击事件
              openPdfFile(record.filename);
            }}
            size="small"
          />
        </Tooltip>
        <Tooltip title="预览PDF">
          <Button
            type="text"
            icon={<FileSearchOutlined />}
            onClick={(e) => {
              e.stopPropagation(); // 防止触发行点击事件
              handlePreviewPdf(record.filename);
            }}
            size="small"
          />
        </Tooltip>
        </>
      ),
    },
  ];

  // 处理PDF预览
  const handlePreviewPdf = (filename: string) => {
    try {
      // 从fileInputRef中获取选择的文件数据
      if (!fileInputRef.current || !fileInputRef.current.dataset.files) {
        messageApi.error("未找到文件信息，请重新选择文件");
        return;
      }

      // 解析存储的文件路径
      const filePaths = JSON.parse(fileInputRef.current.dataset.files);
      
      // 查找匹配的文件路径
      // 1. 通过filename从解析后的发票列表中找到对应的发票索引
      const invoiceDetail = pdfService.getInvoiceDetail(filename);
      if (!invoiceDetail) {
        messageApi.error("无法找到发票详情信息");
        return;
      }
      
      // 2. 从发票文件名中提取基本文件名部分（不含页码标识）
      const baseFilename = invoiceDetail.filename.split('#')[0]; // 移除页码标识
      
      // 3. 在选择的文件路径中查找匹配的文件
      const matchedFilePath = filePaths.find((path: string) => {
        // 提取路径中的文件名部分
        const pathFilename = path.substring(path.lastIndexOf('\\') + 1);
        return pathFilename === baseFilename;
      });
      
      if (!matchedFilePath) {
        messageApi.error(`找不到匹配的文件: ${baseFilename}`);
        return;
      }
      
      console.log("找到匹配的PDF文件:", matchedFilePath);
      
      // 设置文件路径并显示预览
      setSelectedPdfFile(matchedFilePath);
      setPdfPreviewVisible(true);
    } catch (error) {
      messageApi.error(`准备预览PDF失败: ${error}`);
    }
  };

  // 打开PDF文件
  const openPdfFile = (filename: string) => {
    try {
      if (!fileInputRef.current || !fileInputRef.current.dataset.files) {
        messageApi.error("未找到文件信息，请重新选择文件");
        return;
      }

      const filePaths = JSON.parse(fileInputRef.current.dataset.files);
      const invoiceDetail = pdfService.getInvoiceDetail(filename);
      
      if (!invoiceDetail) {
        messageApi.error("无法找到发票详情信息");
        return;
      }
      
      const baseFilename = invoiceDetail.filename.split('#')[0]; // 移除页码标识
      
      const matchedFilePath = filePaths.find((path: string) => {
        const pathFilename = path.substring(path.lastIndexOf('\\') + 1);
        return pathFilename === baseFilename;
      });
      
      if (!matchedFilePath) {
        messageApi.error(`找不到匹配的文件: ${baseFilename}`);
        return;
      }
      
      // 使用Tauri API打开PDF文件
      invoke("open_pdf_file", { path: matchedFilePath })
        .then(() => {
          console.log("成功打开PDF文件");
        })
        .catch((error) => {
          console.error("打开PDF文件失败:", error);
          messageApi.error("打开文件失败，请确认文件存在且可访问");
        });
    } catch (error) {
      messageApi.error(`打开PDF文件失败: ${error}`);
    }
  };

  // 处理表格排序变化
  const handleTableChange = (
    _pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: AntdSorterResult<InvoiceBasic> | AntdSorterResult<InvoiceBasic>[],
    _extra: TableCurrentDataSource<InvoiceBasic>
  ) => {
    if (Array.isArray(sorter)) {
      // 如果是多列排序，暂时只使用第一个
      if (sorter.length > 0) {
        setSorterState({
          field: sorter[0].field,
          order: sorter[0].order,
          columnKey: sorter[0].columnKey,
        });
      }
    } else {
      setSorterState({
        field: sorter.field,
        order: sorter.order,
        columnKey: sorter.columnKey,
      });
    }
  };

  // 隐藏的文件输入，用于存储选择的文件路径
  const hiddenFileInput = (
    <input
      type="file"
      ref={fileInputRef}
      style={{ display: "none" }}
      multiple
      accept=".pdf"
    />
  );

  return (
    <div className="w-full h-screen px-2 flex flex-col overflow-hidden border-r border-gray-100">
      {contextHolder}
      {hiddenFileInput}

      {/* PDF.js环境检查状态 */}
      {pdfJsCheckStatus && (
        <Card className="mb-3 border-red-200 shadow-sm">
          <Space direction="vertical" size="small">
            <Title level={5} className="text-red-600 m-0">
              PDF.js环境检查失败
            </Title>
            <Text type="danger">{pdfJsCheckStatus}</Text>
            <Text type="secondary" className="text-sm">
              请确保项目中的PDF.js库配置正确，包括worker和cMap路径设置。
            </Text>
          </Space>
        </Card>
      )}

      {/* 配置区域 */}
      <Card
        hoverable={false}
        title={
          <Title level={5} className="m-0">
            配置选项
          </Title>
        }
        className="mb-3"
        size="small"
      >
        <Space direction="vertical" className="w-full" size="small">
          <div className="flex items-center gap-4">
            <Input
              placeholder="选择结果文件保存位置"
              value={outputPath}
              disabled
              className="flex-1"
              addonBefore="Excel输出"
              size="small"
            />
            <Button
              icon={<FileSearchOutlined />}
              onClick={selectOutputPath}
              className="bg-gradient-to-r from-blue-400 to-blue-500 border-none text-white"
              size="small"
            >
              选择
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <Input
              placeholder="选择PDF发票文件"
              value={invoicePath}
              disabled
              className="flex-1"
              addonBefore="发票文件"
              size="small"
            />
            <Button
              icon={<UploadOutlined />}
              onClick={selectInvoiceFiles}
              className="bg-gradient-to-r from-blue-400 to-blue-500 border-none text-white"
              size="small"
            >
              选择
            </Button>
          </div>
        </Space>

        {/* 进度条区域 - 只在处理中或有进度时显示 */}
        {(processing || progress > 0) && (
          <div className="my-2">
            <Progress
              percent={progress}
              status={progress === 100 ? "success" : "active"}
              strokeColor={{
                "0%": "#108ee9",
                "100%": "#87d068",
              }}
              size="small"
            />
          </div>
        )}

        <Divider className="my-2" />

        <div className="flex flex-wrap gap-2">
          <Button
            type="primary"
            disabled={processing}
            onClick={startProcessing}
            className="bg-gradient-to-r from-blue-500 to-blue-600"
            size="small"
          >
            开始解析
          </Button>
          <Button danger disabled={!processing} onClick={stopProcessing} size="small">
            停止解析
          </Button>
          <Button
            type="primary"
            disabled={invoices.length === 0}
            onClick={exportResults}
            icon={<ExportOutlined />}
            className="bg-gradient-to-r from-green-500 to-green-600"
            size="small"
          >
            导出结果
          </Button>
          <Button
            danger
            disabled={invoices.length === 0}
            onClick={clearData}
            icon={<DeleteOutlined />}
            size="small"
          >
            清除数据
          </Button>
        </div>
      </Card>

      {/* 统计结果 */}
      <Card
        title={
          <Title level={5} className="m-0">
            统计结果
          </Title>
        }
        className="mb-3"
        size="small"
      >
        <div className="flex flex-wrap justify-between">
          <Card
            className="mb-2 bg-gradient-to-br from-blue-50 to-blue-100 border-none w-[32%]"
            size="small"
          >
            <Statistic
              title={<span className="text-xs">总价税合计</span>}
              value={stats.totalAmountTax}
              precision={2}
              valueStyle={{ color: "#0854a0", fontSize: "16px" }}
              prefix="¥"
            />
          </Card>
          <Card
            className="mb-2 bg-gradient-to-br from-green-50 to-green-100 border-none w-[32%]"
            size="small"
          >
            <Statistic
              title={<span className="text-xs">合计金额</span>}
              value={stats.totalAmount}
              precision={2}
              valueStyle={{ color: "#138535", fontSize: "16px" }}
              prefix="¥"
            />
          </Card>
          <Card
            className="mb-2 bg-gradient-to-br from-purple-50 to-purple-100 border-none w-[32%]"
            size="small"
          >
            <Statistic
              title={<span className="text-xs">发票数量</span>}
              value={stats.invoiceCount}
              valueStyle={{ color: "#722ed1", fontSize: "16px" }}
            />
          </Card>
          <Card
            className="mb-2 bg-gradient-to-br from-yellow-50 to-yellow-100 border-none w-[32%]"
            size="small"
          >
            <Statistic
              title={<span className="text-xs">重复数量</span>}
              value={stats.duplicateCount}
              valueStyle={{ color: "#d48806", fontSize: "16px" }}
            />
          </Card>
          <Card
            className="mb-2 bg-gradient-to-br from-emerald-50 to-emerald-100 border-none w-[32%]"
            size="small"
          >
            <Statistic
              title={<span className="text-xs">解析成功</span>}
              value={stats.successCount}
              valueStyle={{ color: "#10b981", fontSize: "16px" }}
            />
          </Card>
          <Card
            className="mb-2 bg-gradient-to-br from-red-50 to-red-100 border-none w-[32%]"
            size="small"
          >
            <Statistic
              title={<span className="text-xs">解析失败</span>}
              value={stats.failCount}
              valueStyle={{ color: "#cf1322", fontSize: "16px" }}
            />
          </Card>
        </div>
      </Card>

      {/* 发票列表表格 */}
      <Card
        title={
          <Title level={5} className="m-0">
            发票列表
          </Title>
        }
        className="mb-2 flex-1 flex flex-col overflow-hidden"
        size="small"
      >
        <div className="flex-1 overflow-hidden">
          <Table
            columns={columns}
            dataSource={getSortedData()}
            rowKey="filename"
            rowHoverable={false}
            pagination={false}
            sticky
            scroll={{ x: 720, y: 'calc(100vh - 565px)' }}
            bordered
            size="small"
            onChange={handleTableChange}
            rowSelection={{
              selectedRowKeys,
              onChange: (selectedKeys) => setSelectedRowKeys(selectedKeys as string[]),
            }}
            expandable={{
              expandedRowRender: (record) => (
                <Table
                    rowHoverable={false}
                    columns={[
                      {
                        title: "项目名称",
                        dataIndex: "name",
                        key: "name",
                        width: 120,
                        align: "center",
                        ellipsis: true,
                      },
                      {
                        title: "数量",
                        dataIndex: "quantity",
                        key: "quantity",
                        width: 100,
                        align: "center",
                        ellipsis: true,
                      },
                      {
                        title: "单价",
                        dataIndex: "price",
                        key: "price",
                        width: 100,
                        align: "center",
                        ellipsis: true,
                      },
                      {
                        title: "金额",
                        dataIndex: "amount",
                        key: "amount",
                        width: 100,
                        align: "center",
                        ellipsis: true,
                      },
                      {
                        title: "税率",
                        dataIndex: "tax_rate",
                        key: "tax_rate",
                        width: 100,
                        align: "center",
                        ellipsis: true,
                      },
                      {
                        title: "税额",
                        dataIndex: "tax",
                        key: "tax",
                        width: 100,
                        align: "center",
                        ellipsis: true,
                      },
                    ]}
                    dataSource={record.details?.map((item, index) => ({
                      ...item,
                      key: index,
                    }))}
                    pagination={false}
                    size="small"
                    bordered
                  />
              ),
              expandedRowKeys: expandedRowKey ? [expandedRowKey] : [],
              onExpand: (expanded, record) => {
                setExpandedRowKey(expanded ? record.filename : null);
              },
            }}
            onRow={(record) => {
              // 计算行的类名
              let rowClassName = "cursor-pointer transition-colors duration-150 ";
              
              // 判断是否为当前查看的行
              if (selectedInvoice?.filename === record.filename) {
                if (record.status === "重复") {
                  rowClassName += "bg-red-200";
                } else if (record.status === "正常") {
                  rowClassName += "bg-green-200";
                } else {
                  rowClassName += "bg-blue-200";
                }
              } 
              // 判断是否为选中的行
              else if (selectedRowKeys.includes(record.filename)) {
                if (record.status === "重复") {
                  rowClassName += "bg-red-100 hover:bg-red-200";
                } else if (record.status === "正常") {
                  rowClassName += "bg-green-100 hover:bg-green-200";
                } else {
                  rowClassName += "bg-blue-100 hover:bg-blue-200";
                }
              } 
              // 未选中的行
              else {
                if (record.status === "重复") {
                  rowClassName += "hover:bg-red-50";
                } else if (record.status === "正常") {
                  rowClassName += "hover:bg-green-50";
                } else {
                  rowClassName += "hover:bg-gray-50";
                }
              }
              
              return {
                onClick: () => viewInvoiceDetail(record.filename),
                className: rowClassName
              };
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无发票数据"
                />
              ),
            }}
          />
        </div>
      </Card>

      {/* PDF预览模态框 */}
      <PdfPreview
        visible={pdfPreviewVisible}
        onClose={() => setPdfPreviewVisible(false)}
        filename={selectedPdfFile}
      />

      {/* 导出配置模态框 */}
      <Modal
        title="导出配置"
        open={exportModalVisible}
        onOk={handleExportConfirm}
        onCancel={() => setExportModalVisible(false)}
        okText="确认导出"
        cancelText="取消"
        width={700}
      >
        <div className="py-4 space-y-4">
          <div>
            <div className="mb-2">文件名称：</div>
            <Input 
              placeholder="请输入导出的Excel文件名"
              value={outputFilename} 
              onChange={(e) => setOutputFilename(e.target.value)} 
              suffix=".xlsx"
            />
          </div>
          
          <div>
            <div className="mb-2">导出字段选择：</div>
            <div className="border rounded p-3 max-h-40 overflow-y-auto">
              <Checkbox.Group
                value={exportFields}
                onChange={(checkedValues) => {
                  // 确保至少选择一个字段
                  if (checkedValues.length > 0) {
                    setExportFields(checkedValues as string[]);
                  }
                }}
                className="grid grid-cols-3 gap-2"
              >
                {availableExportFields.map(field => (
                  <Checkbox key={field} value={field}>{field}</Checkbox>
                ))}
              </Checkbox.Group>
            </div>
          </div>
          
          <div>
            <Checkbox 
              checked={exportWithDetails} 
              onChange={(e) => setExportWithDetails(e.target.checked)}
            >
              导出发票明细（单独工作表）
            </Checkbox>
          </div>
          
          <div>
            <div className="mb-2">导出范围：</div>
            <Radio.Group 
              defaultValue="all"
              onChange={(e) => {
                if (e.target.value === 'all') {
                  setSelectedRowKeys([]);
                }
              }}
            >
              <Radio value="all">全部发票 ({invoices.length})</Radio>
              <Radio value="selected" disabled={selectedRowKeys.length === 0}>
                仅选中的发票 ({selectedRowKeys.length})
              </Radio>
            </Radio.Group>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ConfigPanel;
