import {
  Card,
  Typography,
  Descriptions,
  Empty
} from "antd";
import React from "react";
import { InvoiceDetail as InvoiceDetailType } from "@/pages/home";
// import type { ColumnsType } from "antd/es/table";

const { Text } = Typography;

interface InvoiceDetailProps {
  selectedInvoice: InvoiceDetailType | null;
  setSelectedInvoice: React.Dispatch<React.SetStateAction<InvoiceDetailType | null>>;
  showItemsTable?: boolean; // 可选参数，控制是否显示发票明细表格
}

// interface InvoiceItemType {
//   name: string;
//   quantity: string;
//   price: string;
//   amount: string;
//   taxRate: string;
//   tax: string;
// }

const InvoiceDetail: React.FC<InvoiceDetailProps> = ({
  selectedInvoice,
  // showItemsTable = true // 默认显示明细表格
}) => {
  // // 表格列定义
  // const columns: ColumnsType<InvoiceItemType> = [
  //   {
  //     title: '货物/服务',
  //     dataIndex: 'name',
  //     key: 'name',
  //     width: 220,
  //     ellipsis: true,
  //   },
  //   {
  //     title: '数量',
  //     dataIndex: 'quantity',
  //     key: 'quantity',
  //     width: 100,
  //     ellipsis: true,
  //   },
  //   {
  //     title: '单价',
  //     dataIndex: 'price',
  //     key: 'price',
  //     width: 100,
  //     ellipsis: true,
  //   },
  //   {
  //     title: '金额',
  //     dataIndex: 'amount',
  //     key: 'amount',
  //     width: 100,
  //     ellipsis: true,
  //   },
  //   {
  //     title: '税率',
  //     dataIndex: 'taxRate',
  //     key: 'taxRate',
  //     width: 100,
  //     ellipsis: true,
  //   },
  //   {
  //     title: '税额',
  //     dataIndex: 'tax',
  //     key: 'tax',
  //     width: 100,
  //     ellipsis: true,
  //   },
  // ];

  // // 获取状态标签颜色
  // const getStatusColor = (status: string) => {
  //   switch (status) {
  //     case '正常': return 'success';
  //     case '重复': return 'error';
  //     case '解析失败': return 'warning';
  //     default: return 'default';
  //   }
  // };

  return (
    <div className="w-full overflow-hidden flex flex-col h-full rounded-md bg-white bg-opacity-70 backdrop-blur-md backdrop-filter">
      {selectedInvoice ? (
        <div className="flex flex-col h-full">
          <div className="overflow-auto p-3 flex-grow mb">
            <div className="grid grid-cols-1 gap-2">
              {/* 发票基本信息 */}
              <Card
                title="操作员信息"
                className="bg-gradient-to-r from-gray-50 to-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300"
                size="small"
              >
                <Descriptions
                  size="small"
                  column={1}
                  labelStyle={{ fontWeight: 500 }}
                  contentStyle={{ fontSize: '13px' }}
                  colon={false}
                >
                  <Descriptions.Item label="文件名">{selectedInvoice.filename || '—'}</Descriptions.Item>
                  <Descriptions.Item label="标题">{selectedInvoice.title || '—'}</Descriptions.Item>
                  <Descriptions.Item label="发票代码">{selectedInvoice.code || '—'}</Descriptions.Item>
                  <Descriptions.Item label="发票号码">{selectedInvoice.number || '—'}</Descriptions.Item>
                  <Descriptions.Item label="开票日期">{selectedInvoice.date || '—'}</Descriptions.Item>
                  <Descriptions.Item label="备注">{selectedInvoice.remark || '—'}</Descriptions.Item>
                </Descriptions>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <Text type="secondary" className="text-xs">收款人</Text>
                    <p className="font-medium text-sm m-0">{selectedInvoice.payee || '—'}</p>
                  </div>
                  <div>
                    <Text type="secondary" className="text-xs">复核人</Text>
                    <p className="font-medium text-sm m-0">{selectedInvoice.reviewer || '—'}</p>
                  </div>
                  <div>
                    <Text type="secondary" className="text-xs">开票人</Text>
                    <p className="font-medium text-sm m-0">{selectedInvoice.drawer || '—'}</p>
                  </div>
                </div>
              </Card>
              {/* 发票基本信息和双方信息区域 */}
              <Card
                title="购买方信息"
                className="bg-gradient-to-r from-green-50 to-green-100 shadow-sm hover:shadow-md transition-shadow duration-300"
                size="small"
              >
                <Descriptions
                  size="small"
                  column={1}
                  labelStyle={{ fontWeight: 500 }}
                  contentStyle={{ fontSize: '13px' }}
                  colon={false}
                >
                  <Descriptions.Item label="名称">{selectedInvoice.buyer.name || '—'}</Descriptions.Item>
                  <Descriptions.Item label="税号">{selectedInvoice.buyer.taxCode || '—'}</Descriptions.Item>
                  <Descriptions.Item label="地址、电话">{selectedInvoice.buyer.addressPhone || '—'}</Descriptions.Item>
                  <Descriptions.Item label="开户行及账号">{selectedInvoice.buyer.bankAccount || '—'}</Descriptions.Item>
                </Descriptions>
              </Card>

              <Card
                title="销售方信息"
                className="bg-gradient-to-r from-amber-50 to-amber-100 shadow-sm hover:shadow-md transition-shadow duration-300"
                size="small"
              >
                <Descriptions
                  size="small"
                  column={1}
                  labelStyle={{ fontWeight: 500 }}
                  contentStyle={{ fontSize: '13px' }}
                  colon={false}
                >
                  <Descriptions.Item label="名称">{selectedInvoice.seller.name || '—'}</Descriptions.Item>
                  <Descriptions.Item label="税号">{selectedInvoice.seller.taxCode || '—'}</Descriptions.Item>
                  <Descriptions.Item label="地址、电话">{selectedInvoice.seller.addressPhone || '—'}</Descriptions.Item>
                  <Descriptions.Item label="开户行及账号">{selectedInvoice.seller.bankAccount || '—'}</Descriptions.Item>
                </Descriptions>
              </Card>

              {/* 发票明细区域 - 仅当showItemsTable为true时显示 */}
              {/* {showItemsTable && (
                <Card 
                  title={<Title level={5} className="m-0">发票明细</Title>}
                  size="small"
                >
                  <div className="overflow-auto">
                    <Table
                      columns={columns}
                      dataSource={selectedInvoice.items.map((item, index) => ({
                        ...item,
                        key: index
                      }))}
                      size="small"
                      pagination={false}
                      bordered
                      scroll={{ x: 720 }}
                      className="invoice-detail-table"
                    />
                  </div>
                </Card>
              )} */}
            </div>
          </div>
        </div>
      ) : (
        <div className="h-full flex items-center justify-center">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="选择发票以查看详细信息"
            className="mt-8"
          />
        </div>
      )}
    </div>
  );
};

export default InvoiceDetail;
