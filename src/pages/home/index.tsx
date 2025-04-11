import React, { useState } from "react";
import { Layout } from "antd";
import ConfigPanel from "./components/ConfigPanel";
import InvoiceDetail from "./components/InvoiceDetail";

// 发票详细信息类型
export interface InvoiceDetail {
  filename: string;
  index: number;
  title: string;
  code: string;
  number: string;
  date: string;
  checksum: string;
  machineNumber: string;
  password: string;
  remark: string;
  buyer: {
    name: string;
    taxCode: string;
    addressPhone: string;
    bankAccount: string;
  };
  seller: {
    name: string;
    taxCode: string;
    addressPhone: string;
    bankAccount: string;
  };
  items: {
    name: string;
    quantity: string;
    price: string;
    amount: string;
    taxRate: string;
    tax: string;
  }[];
  payee: string;
  reviewer: string;
  drawer: string;
  status: string;
  duplicateInfo: string;
}

const { Content } = Layout;

const Home: React.FC = () => {
  // 选中的发票详情
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);

  return (
    <Layout className="min-h-screen">
      <Content className="flex rounded-xl overflow-hidden">
        <div className="flex flex-col w-3/5">
          {/* 左侧配置区域 */}
          <div className="flex-grow overflow-auto">
            <ConfigPanel selectedInvoice={selectedInvoice} setSelectedInvoice={setSelectedInvoice} />
          </div>
        </div>
        
        {/* 右侧详细信息 */}
        <div className="w-2/5 pb-2">
          <InvoiceDetail 
            selectedInvoice={selectedInvoice} 
            setSelectedInvoice={setSelectedInvoice}
            showItemsTable={false} // 不在详情中显示明细表格
          />
        </div>
      </Content>
    </Layout>
  );
}

export default Home;
