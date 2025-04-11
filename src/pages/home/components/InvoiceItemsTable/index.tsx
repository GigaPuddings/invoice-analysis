import { Table, Card, Typography, Empty } from "antd";
import React from "react";
import { InvoiceDetail as InvoiceDetailType } from "@/pages/home";
import type { ColumnsType } from "antd/es/table";

const { Title } = Typography;

interface InvoiceItemsTableProps {
  selectedInvoice: InvoiceDetailType | null;
}

interface InvoiceItemType {
  name: string;
  quantity: string;
  price: string;
  amount: string;
  taxRate: string;
  tax: string;
}

const InvoiceItemsTable: React.FC<InvoiceItemsTableProps> = ({
  selectedInvoice,
}) => {
  // 表格列定义
  const columns: ColumnsType<InvoiceItemType> = [
    {
      title: "货物/服务",
      dataIndex: "name",
      key: "name",
      width: 220,
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
      dataIndex: "taxRate",
      key: "taxRate",
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
  ];

  return (
    <div className="w-full h-full bg-white bg-opacity-70 backdrop-blur-md backdrop-filter">
      <Card
        title={
          <Title level={5} className="m-0">
            发票明细
          </Title>
        }
        className="h-full"
      >
        {selectedInvoice ? (
          <Table
            columns={columns}
            dataSource={selectedInvoice.items.map((item, index) => ({
              ...item,
              key: index,
            }))}
            size="small"
            bordered
            pagination={{ 
              pageSize: 2,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 条`
            }}
            scroll={{ x: 720 }}
            className="invoice-detail-table"
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="选择发票以查看明细"
            />
          </div>
        )}
      </Card>
    </div>
  );
};

export default InvoiceItemsTable;
