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
} from "antd";
import {
  FileSearchOutlined,
  UploadOutlined,
  ExportOutlined,
  DeleteOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import React, { useState, useRef, useEffect } from "react";
import { InvoiceDetail } from "@/pages/home";
import { pdfService } from "@/services/pdfService";
import { open } from "@tauri-apps/plugin-dialog";
import { checkPdfJsEnvironment } from "@/utils/pdfjs-checker";
import type { ColumnsType } from "antd/es/table";
import PdfPreview from "@/components/PdfPreview";

const { Title, Text } = Typography;

interface ConfigPanelProps {
  selectedInvoice: InvoiceDetail | null;
  setSelectedInvoice: React.Dispatch<
    React.SetStateAction<InvoiceDetail | null>
  >;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({
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
    remark: string;
    status: InvoiceStatus;
    duplicateInfo: string;
    details?: Array<{
      name: string;
      quantity: string;
      price: string;
      amount: string;
      tax_rate: string;
      tax: string;
    }>;
  }
  const [outputPath, setOutputPath] = useState<string>("");
  const [invoicePath, setInvoicePath] = useState<string>("");
  const [processing, setProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messageApi, contextHolder] = message.useMessage();

  // 发票列表状态
  const [invoices, setInvoices] = useState<InvoiceBasic[]>([]);
  // 添加展开行的状态控制
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  // 统计结果状态对象（确保与 pdfService 中定义的完全一致）
  interface StatsType {
    totalAmount: number;
    totalTax: number;
    invoiceCount: number;
    duplicateCount: number;
    successCount: number;
    failCount: number;
    currentProgress: number;
  }

  // 统计结果状态
  const [stats, setStats] = useState<StatsType>({
    totalAmount: 0,
    totalTax: 0,
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
            totalTax: currentStats.totalTax,
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
              totalTax:inv.total_tax,
              remark: inv.remark,
              status: inv.status as InvoiceStatus,
              duplicateInfo: inv.duplicate_info,
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
        totalTax: finalStats.totalTax,
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

    try {
      await pdfService.exportResults(outputPath);

      messageApi.success({
        content: `结果已导出至 ${outputPath}`,
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
        totalTax: 0,
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
    },
    {
      title: "开票日期",
      dataIndex: "date",
      key: "date",
      width: 160,
      align: "center",
      ellipsis: true,
    },
    {
      title: "金额",
      dataIndex: "totalAmount",
      key: "totalAmount",
      width: 120,
      align: "center",
      ellipsis: true,
    },
    {
      title: "税价合计",
      dataIndex: "totalTax",
      key: "totalTax",
      width: 120,
      align: "center",
      ellipsis: true,
    },
    // {
    //   title: "备注",
    //   dataIndex: "remark",
    //   key: "remark",
    //   align: "center",
    //   width: 180,
    //   ellipsis: true,
    // },
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
        <Tooltip title="预览PDF">
          <Button
            type="text"
            icon={<FilePdfOutlined />}
            onClick={(e) => {
              e.stopPropagation(); // 防止触发行点击事件
              handlePreviewPdf(record.filename);
            }}
            size="small"
          />
        </Tooltip>
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
              value={stats.totalTax}
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
            dataSource={invoices}
            rowKey="filename"
            rowHoverable={false}
            pagination={false}
            sticky
            scroll={{ x: 720, y: 'calc(100vh - 565px)' }}
            bordered
            size="small"
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
            onRow={(record) => ({
              onClick: () => viewInvoiceDetail(record.filename),
              className:
                record.status === "重复"
                  ? "cursor-pointer hover:bg-red-50 transition-colors duration-150"
                  : record.status === "正常"
                  ? "cursor-pointer hover:bg-green-50 transition-colors duration-150"
                  : "cursor-pointer hover:bg-gray-50 transition-colors duration-150",
            })}
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
    </div>
  );
};

export default ConfigPanel;
