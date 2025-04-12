use regex;
use rust_xlsxwriter::{Color, Format, FormatBorder, Workbook};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::Path,
    sync::{Arc, Mutex, OnceLock},
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
// use tauri_plugin_notification::NotificationExt;

// 定义一个全局静态变量来存储 AppHandle
static APP: OnceLock<AppHandle> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InvoiceItem {
    name: String,
    quantity: String,
    price: String,
    amount: String,
    tax_rate: String,
    tax: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Invoice {
    filename: String,
    index: usize,
    title: String,
    #[serde(rename = "type")]
    invoice_type: String,
    code: String,
    number: String,
    date: String,
    checksum: String,
    machine_number: String,
    password: String,
    remark: String,
    buyer: InvoiceParty,
    seller: InvoiceParty,
    items: Vec<InvoiceItem>,
    total_amount: String,
    total_tax: String,
    total_amount_tax: String,
    payee: String,
    reviewer: String,
    drawer: String,
    status: String,
    duplicate_info: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InvoiceParty {
    name: String,
    tax_code: String,
    address_phone: String,
    bank_account: String,
}

// 文本位置信息，对应前端的TextItem接口
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TextItem {
    text: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    #[serde(rename = "pageIndex")]
    page_index: usize,
    #[serde(rename = "fontName")]
    font_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ProcessingStats {
    total_amount: String,
    total_tax: String,
    invoice_count: usize,
    duplicate_count: usize,
    success_count: usize,
    fail_count: usize,
}

struct ProcessingState {
    invoices: Vec<Invoice>,
    stats: ProcessingStats,
}

impl Default for ProcessingState {
    fn default() -> Self {
        Self {
            invoices: Vec::new(),
            stats: ProcessingStats::default(),
        }
    }
}

type AppState = Arc<Mutex<ProcessingState>>;

// 解析PDF提取的文本位置信息
#[tauri::command]
async fn parse_invoice_text(
    filename: &str,
    pages_text_items: Vec<Vec<TextItem>>,
) -> Result<Vec<Invoice>, String> {
    // println!("接收到前端发来的文本解析请求: {}", filename);
    // println!("共 {} 页文本数据", pages_text_items.len());

    // 检查输入数据
    if pages_text_items.is_empty() {
        return Err("没有接收到文本数据".to_string());
    }

    let mut all_parsed_results = Vec::new();

    // 处理每一页
    for (page_index, text_items) in pages_text_items.iter().enumerate() {
        // println!("开始处理第 {} 页, 共 {} 个文本项", page_index + 1, text_items.len());

        // 跳过空页面
        if text_items.is_empty() {
            println!("第 {} 页没有文本项，跳过处理", page_index + 1);
            // 创建一个空的发票对象标记为解析失败
            let mut empty_invoice = create_empty_invoice(filename, "解析失败", page_index);
            empty_invoice.remark = "该页没有可识别的文本".to_string();
            all_parsed_results.push(empty_invoice);
            continue;
        }

        // 创建一个空的发票对象
        let invoice = create_empty_invoice(filename, "待统计", page_index);

        // 用try-catch包装解析过程，防止单页解析失败影响整体
        let parsed_invoice = match std::panic::catch_unwind(|| {
            parse_generic_fapiao(text_items, invoice.clone(), page_index)
        }) {
            Ok(invoice) => invoice,
            Err(e) => {
                println!("第 {} 页解析时发生错误: {:?}", page_index + 1, e);
                let mut failed_invoice = invoice.clone();
                failed_invoice.status = "解析失败".to_string();
                failed_invoice.remark = "发票解析过程中出现错误".to_string();
                failed_invoice
            }
        };

        // println!("第 {} 页解析完成，发票号码: {}", page_index + 1, parsed_invoice.number);
        all_parsed_results.push(parsed_invoice);
    }

    // println!("文件 {} 解析完成，共 {} 页发票", filename, all_parsed_results.len());

    // 如果没有解析到任何发票，返回一个解析失败的结果
    if all_parsed_results.is_empty() {
        let mut failed_invoice = create_empty_invoice(filename, "解析失败", 0);
        failed_invoice.remark = "未能识别任何发票信息".to_string();
        all_parsed_results.push(failed_invoice);
    }

    Ok(all_parsed_results)
}

// 创建空的发票对象
fn create_empty_invoice(filename: &str, status: &str, page_index: usize) -> Invoice {
    // 添加页面索引到文件名以区分多页发票
    let filename_with_page = if page_index > 0 {
        format!("{}#第{}页", filename, page_index + 1)
    } else {
        filename.to_string()
    };

    Invoice {
        filename: filename_with_page,
        index: 0,
        title: "".to_string(),
        invoice_type: "".to_string(),
        code: "".to_string(),
        number: "".to_string(),
        date: "".to_string(),
        checksum: "".to_string(),
        machine_number: "".to_string(),
        password: "".to_string(),
        remark: "".to_string(),
        buyer: InvoiceParty {
            name: "".to_string(),
            tax_code: "".to_string(),
            address_phone: "".to_string(),
            bank_account: "".to_string(),
        },
        seller: InvoiceParty {
            name: "".to_string(),
            tax_code: "".to_string(),
            address_phone: "".to_string(),
            bank_account: "".to_string(),
        },
        items: Vec::new(),
        total_amount: "0.00".to_string(),
        total_tax: "0.00".to_string(),
        total_amount_tax: "0.00".to_string(),
        payee: "".to_string(),
        reviewer: "".to_string(),
        drawer: "".to_string(),
        status: status.to_string(),
        duplicate_info: "".to_string(),
    }
}

// 根据关键词提取相邻文本
fn extract_nearby_text(
    text_items: &[TextItem],
    reference_text: &regex::Regex,
    direction: &str,
    max_distance: f64,
) -> String {
    // 找到参考文本项
    let ref_item = text_items
        .iter()
        .find(|item| reference_text.is_match(&item.text));
    if ref_item.is_none() {
        return "".to_string();
    }

    let ref_item = ref_item.unwrap();

    // 根据方向筛选候选文本项
    let mut candidates: Vec<&TextItem> = text_items
        .iter()
        .filter(|item| {
            // 排除参考项自身
            if std::ptr::eq(*item, ref_item) {
                return false;
            }

            // 根据方向过滤
            match direction {
                "right" => {
                    (item.y - ref_item.y).abs() < 10.0 && // 同一行或接近
                item.x > ref_item.x && // 在参考项右侧
                item.x - ref_item.x < max_distance // 距离在范围内
                }
                "left" => {
                    (item.y - ref_item.y).abs() < 10.0 && // 同一行或接近
                item.x < ref_item.x && // 在参考项左侧
                ref_item.x - item.x < max_distance // 距离在范围内
                }
                "up" => {
                    (item.x - ref_item.x).abs() < max_distance / 2.0 && // x坐标接近
                item.y > ref_item.y && // 在参考项上方
                item.y - ref_item.y < max_distance // 距离在范围内
                }
                "down" => {
                    (item.x - ref_item.x).abs() < max_distance / 2.0 && // x坐标接近
                item.y < ref_item.y && // 在参考项下方
                ref_item.y - item.y < max_distance // 距离在范围内
                }
                "same-line" => {
                    (item.y - ref_item.y).abs() < 10.0 && // 同一行或接近
                (item.x - ref_item.x).abs() < max_distance // 水平距离在范围内
                }
                _ => false,
            }
        })
        .collect();
    // 按照与参考点的距离排序
    candidates.sort_by(|a, b| {
        let dist_a = ((a.x - ref_item.x).powi(2) + (a.y - ref_item.y).powi(2)).sqrt();
        let dist_b = ((b.x - ref_item.x).powi(2) + (b.y - ref_item.y).powi(2)).sqrt();
        dist_a.partial_cmp(&dist_b).unwrap()
    });

    // 如果是水平方向，还需要按照从左到右排序
    if direction == "right" || direction == "same-line" {
        candidates.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap());
    } else if direction == "left" {
        candidates.sort_by(|a, b| b.x.partial_cmp(&a.x).unwrap());
    } else if direction == "up" {
        candidates.sort_by(|a, b| b.y.partial_cmp(&a.y).unwrap());
    } else if direction == "down" {
        candidates.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap());
    }

    // 取最接近的文本或合并多个文本，过滤掉包含冒号的文本
    candidates
        .iter()
        .filter(|item| !item.text.contains(':') && !item.text.contains('：'))
        .map(|item| item.text.clone())
        .collect::<Vec<String>>()
        .join(" ")
        .trim()
        .to_string()
}

// 提取发票购买方和销售方信息
fn extract_party_info(
    text_items: &[TextItem],
    invoice: &mut Invoice,
    header_char: &str,
    is_seller_info: bool,
) {
    // 标识字符 (购/销)
    let header_item = text_items.iter().find(|item| item.text == header_char);
    if header_item.is_none() {
        return;
    }

    let header_item = header_item.unwrap();
    let header_x = header_item.x;
    let header_y = header_item.y;

    // 查找底部边界的文本项
    let footer_item = text_items
        .iter()
        .fold(None, |result: Option<&TextItem>, item| {
            if (header_x - item.x).abs() > 1.0 {
                return result;
            }
            if item.y > header_y && item.text == "息" {
                return Some(item);
            }
            if item.y > header_y
                && (item.text == "方" || item.text == "⽅")
                && (item.y - header_y).abs() < 50.0
                && result.is_none()
            {
                return Some(item);
            }
            result
        });
    if footer_item.is_none() {
        return;
    }

    let footer_item = footer_item.unwrap();
    // 区域坐标偏移量
    let offset_x_left = if invoice.invoice_type == "普通发票" {
        8.0
    } else {
        15.0
    };
    let offset_x_right = if invoice.invoice_type == "普通发票" {
        250.0
    } else {
        300.0
    };
    let offset_y = if invoice.invoice_type == "普通发票" {
        0.0
    } else {
        8.0
    };

    // 信息区域坐标
    let area_left_top = (
        (header_x as f64).floor() + offset_x_left,
        (header_y as f64).floor() - offset_y,
    );
    let area_right_top = (
        (header_x as f64).floor() + offset_x_right,
        (header_y as f64).floor() - offset_y,
    );
    let area_right_bottom = (
        (footer_item.x as f64).floor() + offset_x_right,
        (footer_item.y as f64).floor() + offset_y,
    );

    // 查找区域内的所有文本项
    let area_items: Vec<&TextItem> = text_items
        .iter()
        .filter(|item| {
            item.x >= area_left_top.0
                && item.x <= area_right_top.0
                && item.y >= area_left_top.1
                && item.y <= area_right_bottom.1
                && item.page_index == footer_item.page_index
        })
        .collect();

    // 获取特定字段的值
    let get_field_value = |label_pattern: &regex::Regex| -> String {
        let label_item = area_items
            .iter()
            .find(|item| label_pattern.is_match(&item.text));
        if label_item.is_none() {
            return "".to_string();
        }

        let label_item = label_item.unwrap();
        let label_x = label_item.x;
        let label_width = label_item.width;
        let label_y = label_item.y;
        let label_right = label_x + label_width;

        let mut result = String::new();
        for item in &area_items {
            if item.x + item.width > label_right
                && (item.y - label_y).abs() <= 6.0
                && !item.text.contains(':')
                && !item.text.contains('：')
            {
                result.push_str(&item.text);
            }
        }

        result
    };

    // 设置到相应的对象
    let party_obj = if is_seller_info {
        &mut invoice.seller
    } else {
        &mut invoice.buyer
    };

    // 提取名称
    party_obj.name = get_field_value(&regex::Regex::new(r"称[:：]?$").unwrap());

    // 提取纳税人识别号
    party_obj.tax_code = get_field_value(&regex::Regex::new(r"识别号[:：]?$").unwrap());

    // 提取地址、电话
    party_obj.address_phone = get_field_value(&regex::Regex::new(r"电话[:：]?$").unwrap());

    // 提取开户行及账号
    party_obj.bank_account = get_field_value(&regex::Regex::new(r"开户行及账号[:：]?$").unwrap());
}

// 提取备注信息
fn extract_remark_info(text_items: &[TextItem], invoice: &mut Invoice) {
    // 查找参考项
    let header_item = text_items.iter().find(|item| item.text == "备");
    if header_item.is_none() {
        return;
    }

    let header_item = header_item.unwrap();
    let hw = header_item.x + header_item.width;
    let lt = header_item.y - 14.0;
    let lb = header_item.y + 33.0;

    // 查询区域内的所有文本
    let area_items: Vec<&TextItem> = text_items
        .iter()
        .filter(|item| {
            item.x >= hw && // 右侧
        item.y >= lt && // 最上侧边界
        item.y <= lb // 最下侧边界
        })
        .collect();

    let mut result = String::new();
    for (i, r) in area_items.iter().enumerate() {
        if i > 0 && area_items[i - 1].y != r.y {
            result.push('\n');
        }
        result.push_str(&r.text);
    }

    invoice.remark = result;
}

// 按y坐标进行分组，形成每一"行"
fn group_items_by_row<'a>(items: &'a [&'a TextItem], y_tolerance: f64) -> Vec<Vec<&'a TextItem>> {
    let mut rows: Vec<Vec<&TextItem>> = Vec::new();

    for item in items {
        let mut matched = false;

        for row in &mut rows {
            if (row[0].y - item.y).abs() <= y_tolerance {
                row.push(item);
                matched = true;
                break;
            }
        }

        if !matched {
            rows.push(vec![*item]);
        }
    }

    // 每行内部按x排序
    for row in &mut rows {
        row.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap());
    }

    // 所有行按y排序
    rows.sort_by(|a, b| a[0].y.partial_cmp(&b[0].y).unwrap());

    rows
}

// 提取发票商品信息
fn extract_invoice_items(text_items: &[TextItem], invoice: &mut Invoice) {
    // 查找商品表头行 - 通常包含"货物名称"、"规格型号"、"单位"、"数量"等字段
    let name_header_item = text_items
        .iter()
        .find(|item| item.text.contains("货物") || item.text.contains("项目"));

    if name_header_item.is_none() {
        // 没有找到表头，添加一个空的商品项
        invoice.items.push(InvoiceItem {
            name: "未能识别".to_string(),
            quantity: "0".to_string(),
            price: "0".to_string(),
            amount: "0".to_string(),
            tax_rate: "0".to_string(),
            tax: "0".to_string(),
        });
        return;
    }

    let name_header_item = name_header_item.unwrap();

    // 确定表格的垂直范围 - 通常表头下方到"合计"行之前
    let model_bottom_item = text_items
        .iter()
        .find(|item| item.text == "合" || item.text == "合计");

    if model_bottom_item.is_none() {
        return;
    }

    let model_bottom_item = model_bottom_item.unwrap();
    // 安全计算上边界，防止减法溢出
    let model_header_y = if name_header_item.y > 2.0 {
        name_header_item.y - 2.0
    } else {
        0.0
    };
    let model_bottom_y = model_bottom_item.y;

    // 发票明细区域
    let area_items: Vec<&TextItem> = text_items
        .iter()
        .filter(|item| {
            item.y >= model_header_y && // 上边界
        item.y < model_bottom_y &&
        (model_bottom_y - item.y).abs() >= 5.0 // 下边界
        })
        .collect();

    // 排除标题区域
    let no_title = name_header_item.y + 5.0;
    let value_items: Vec<&TextItem> = area_items
        .iter()
        .filter(|item| item.y >= no_title)
        .copied()
        .collect();

    // 分组
    let grouped_rows = group_items_by_row(&value_items, 2.0);

    let mut flag_map = std::collections::HashMap::new();

    for (i, row) in grouped_rows.iter().enumerate() {
        // 防止索引越界
        if row.is_empty() {
            continue;
        }

        // 判断是否是补充名称行（只有一个字段且不以 * 开头）
        if row.len() <= 3 && !row[0].text.starts_with('*') && i > 0 && !invoice.items.is_empty() {
            let last_index = invoice.items.len() - 1;
            invoice.items[last_index].name.push_str(&row[0].text);
            continue; // 当前行不作为新的一项
        }

        // 初始化新项目
        let mut result = InvoiceItem {
            name: "".to_string(),
            quantity: "".to_string(),
            price: "".to_string(),
            amount: "".to_string(),
            tax_rate: "".to_string(),
            tax: "".to_string(),
        };

        // 正常行解析
        for (index, text_item) in row.iter().enumerate() {
            let value = &text_item.text;
            let item_ptr = std::ptr::from_ref::<TextItem>(*text_item) as usize;

            // 名称（通常是第一列，可能以 * 开头）
            if index == 0 {
                result.name = value.clone();
            }

            if row.len() > 5 && (index == row.len() - 5 || index == row.len() - 4) {
                // 数量，只有当还没设置时才赋值
                let is_quantity_format = regex::Regex::new(r"^\d+$").unwrap().is_match(value);
                if is_quantity_format && !flag_map.contains_key(&item_ptr) {
                    flag_map.insert(item_ptr, 1);
                    result.quantity = value.clone();
                }

                // 金额，只有当还没设置时才赋值
                let is_price_format = regex::Regex::new(r"^[¥￥]?-?[\d.]+$")
                    .unwrap()
                    .is_match(value);
                if is_price_format && !flag_map.contains_key(&item_ptr) {
                    flag_map.insert(item_ptr, 1);
                    result.price = value.clone();
                }
            }

            if row.len() > 3 && index == row.len() - 3 {
                let is_amount_format = regex::Regex::new(r"^[¥￥]?-?[\d.]+$")
                    .unwrap()
                    .is_match(value);
                if is_amount_format {
                    // 金额
                    result.amount = value.clone();
                }
            }

            if row.len() > 2 && index == row.len() - 2 && value.contains('%') {
                // 税率
                result.tax_rate = value.clone();
            }

            if row.len() > 1 && index == row.len() - 1 {
                let is_tax_format = regex::Regex::new(r"^[¥￥]?-?[\d.]+$")
                    .unwrap()
                    .is_match(value);
                if is_tax_format {
                    // 税额
                    result.tax = value.clone();
                }
            }
        }

        invoice.items.push(result);
    }

    // 如果没有提取到有效的商品项，添加一个默认项
    if invoice.items.is_empty() {
        invoice.items.push(InvoiceItem {
            name: "未能识别的商品".to_string(),
            quantity: "0".to_string(),
            price: "0".to_string(),
            amount: "0".to_string(),
            tax_rate: "0".to_string(),
            tax: "0".to_string(),
        });
    }
}

// 提取合计金额和合计税额
fn extract_total_amount_and_tax(text_items: &[TextItem], invoice: &mut Invoice) {
    let candidate_item = text_items
        .iter()
        .find(|item| item.text == "计" || item.text == "合计");

    if candidate_item.is_none() {
        return;
    }

    let candidate_item = candidate_item.unwrap();

    // 提取同一行中金额
    let same_line_items: Vec<&TextItem> = text_items
        .iter()
        .filter(|t| (t.y - candidate_item.y).abs() < 5.0 && t.x > candidate_item.x)
        .collect();

    // 排序
    let mut sorted_items = same_line_items.clone();
    sorted_items.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap());

    let mut values: Vec<String> = Vec::new();

    let mut i = 0;
    while i < sorted_items.len() {
        let text = &sorted_items[i].text;
        let is_amount_format = regex::Regex::new(r"^[¥￥]?\d+(\.\d+)?$")
            .unwrap()
            .is_match(text);

        if is_amount_format {
            values.push(text.replace(|c| c == '¥' || c == '￥', ""));
        } else if text == "¥" || text == "￥" {
            if i + 1 < sorted_items.len() {
                let next_text = &sorted_items[i + 1].text;
                let is_next_amount = regex::Regex::new(r"^\d+(\.\d+)?$")
                    .unwrap()
                    .is_match(next_text);
                if is_next_amount {
                    values.push(next_text.clone());
                    i += 1; // 跳过下一个已处理
                }
            }
        }

        i += 1;
    }

    if !values.is_empty() {
        // 合计金额
        invoice.total_amount = values[0].clone();
        // 合计税额
        if values.len() > 1 {
            invoice.total_tax = values[1].clone();
        }
    }

    // 提取合计税价
    let tax_regex = regex::Regex::new(r"[（(]?小写[)）]?").unwrap();
    invoice.total_amount_tax = extract_nearby_text(text_items, &tax_regex, "right", 100.0)
        .replace(|c| c == '¥' || c == '￥', "");
}

// 根据通用发票格式解析发票信息
fn parse_generic_fapiao(
    text_items: &[TextItem],
    mut invoice: Invoice,
    page_index: usize,
) -> Invoice {
    // 设置页面索引
    invoice.index = page_index + 1;

    // 根据关键词提取标题
    let title_regex = regex::Regex::new(r"电[⼦子]\S*").unwrap();
    let title_item = text_items
        .iter()
        .find(|item| title_regex.is_match(&item.text));

    if let Some(title_item) = title_item {
        if title_item.text.contains("增值") {
            invoice.title = if page_index == 0 {
                title_item.text.clone()
            } else {
                format!("{} (第{}页)", title_item.text, page_index + 1)
            };
            invoice.invoice_type = "增值税电子普通发票".to_string();
        } else {
            invoice.title = if page_index == 0 {
                title_item.text.clone()
            } else {
                format!("{} (第{}页)", title_item.text, page_index + 1)
            };
            invoice.invoice_type = "普通发票".to_string();
        }
    } else {
        // 如果没有找到标题，至少设置页码信息
        invoice.title = if page_index == 0 {
            "发票".to_string()
        } else {
            format!("发票 (第{}页)", page_index + 1)
        };
    }

    // 提取发票代码
    let code_regex = regex::Regex::new(r"发票代码[:：]?").unwrap();
    invoice.code = extract_nearby_text(text_items, &code_regex, "right", 100.0);

    // 提取发票号码
    let number_regex = regex::Regex::new(r"发票号码[:：]?").unwrap();
    invoice.number = extract_nearby_text(text_items, &number_regex, "right", 100.0);

    // 提取开票日期
    let date_regex = regex::Regex::new(r"开票日期[:：]?").unwrap();
    invoice.date = extract_nearby_text(text_items, &date_regex, "right", 150.0);

    // 提取校验码
    let checksum_regex = regex::Regex::new(r"^校验码[:：]|^码[:：]").unwrap();
    invoice.checksum = extract_nearby_text(text_items, &checksum_regex, "right", 250.0);

    // 提取购买方信息
    extract_party_info(text_items, &mut invoice, "购", false);

    // 提取销售方信息
    extract_party_info(text_items, &mut invoice, "销", true);

    // 提取开票人、收款人、复核人
    let drawer_regex = regex::Regex::new(r"^开票.{0,1}[:：]$").unwrap();
    invoice.drawer = extract_nearby_text(text_items, &drawer_regex, "right", 100.0);

    let payee_regex = regex::Regex::new(r"^收款.{0,1}[:：]$").unwrap();
    invoice.payee = extract_nearby_text(text_items, &payee_regex, "right", 100.0);

    let reviewer_regex = regex::Regex::new(r"^复核.{0,1}[:：]$").unwrap();
    invoice.reviewer = extract_nearby_text(text_items, &reviewer_regex, "right", 100.0);

    // 提取备注
    extract_remark_info(text_items, &mut invoice);

    // 提取商品信息
    extract_invoice_items(text_items, &mut invoice);

    // 提取合计金额和合计税额
    extract_total_amount_and_tax(text_items, &mut invoice);

    invoice
}

async fn update(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
  if let Some(update) = app.updater()?.check().await? {
    let mut downloaded = 0;

    // 另外，我们也可以单独调用update.download（）和update.install（）
    update
      .download_and_install(
        |chunk_length, content_length| {
          downloaded += chunk_length;
          println!("downloaded {downloaded} from {content_length:?}");
        },
        || {
          println!("download finished");
        },
      )
      .await?;

    println!("update installed");
    app.restart();
  }

  Ok(())
}

// 选择输出路径
#[tauri::command]
async fn select_output_path(app: tauri::AppHandle) -> Result<String, String> {
    // 只允许选择文件夹
    let desktop = dirs::desktop_dir().ok_or("无法找到桌面目录")?;
    let selected_path = app
        .dialog()
        .file()
        .set_directory(desktop)
        .set_title("选择文件目录")
        .blocking_pick_folder()
        .ok_or("已取消选择目录")?;
    Ok(selected_path.to_string())
}

// 导出结果
#[tauri::command]
fn export_results(
    path: &str,
    filename: Option<&str>,
    export_with_details: Option<bool>,
    export_fields: Option<Vec<String>>, // 添加导出字段参数
    state: State<AppState>,
) -> Result<(), String> {
    let processing_state = state
        .lock()
        .map_err(|_| "Failed to lock state".to_string())?;

    if processing_state.invoices.is_empty() {
        return Err("没有可导出的发票数据".to_string());
    }

    // 使用rust_xlsxwriter导出Excel
    let output_path = Path::new(path);
    if !output_path.exists() {
        fs::create_dir_all(output_path).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    // 使用提供的文件名或默认名称
    let file_name = filename.unwrap_or("发票数据汇总");
    let include_details = export_with_details.unwrap_or(false);

    // 获取要导出的字段列表，如果未提供则使用默认值
    let fields_to_export = export_fields.unwrap_or_else(|| {
        vec![
            "序号".to_string(),
            "文件名".to_string(),
            "状态".to_string(),
            "发票代码".to_string(),
            "发票号码".to_string(),
            "开票日期".to_string(),
            "购买方名称".to_string(),
            "购买方税号".to_string(),
            "购买方地址、电话".to_string(),
            "购买方开户行账号".to_string(),
            "销售方名称".to_string(),
            "销售方税号".to_string(),
            "销售方地址电话".to_string(),
            "销售方开户行账号".to_string(),
            "收款人".to_string(),
            "复核人".to_string(),
            "开票人".to_string(),
            "金额".to_string(),
            "税额".to_string(),
            "价税合计".to_string(),
            "备注".to_string(),
            "重复信息".to_string(),
        ]
    });

    // 创建Excel工作簿
    let mut workbook = Workbook::new();

    // 创建表头格式
    let header_format = Format::new()
        .set_bold()
        .set_border(FormatBorder::Thin)
        .set_background_color(Color::RGB(0xD9E1F2)); // 淡蓝色背景

    // 创建数据格式
    let data_format = Format::new().set_border(FormatBorder::Thin);

    // 创建重复项格式（红色背景）
    let duplicate_format = Format::new()
        .set_border(FormatBorder::Thin)
        .set_background_color(Color::RGB(0xFFCCCB)); // 红色背景

    // 创建不同重复组的颜色
    let duplicate_colors = [
        Color::RGB(0xFFCCCB), // 红色
        Color::RGB(0xFFDAB9), // 橙色
        Color::RGB(0xFAFAD2), // 黄色
        Color::RGB(0xE0FFFF), // 浅青色
        Color::RGB(0xD8BFD8), // 浅紫色
    ];

    // 创建重复组格式映射
    let mut duplicate_group_formats = std::collections::HashMap::new();
    let mut duplicate_group_count = 0;

    // 创建汇总表和明细表（如果需要）
    let main_sheet_name = "发票汇总";
    let detail_sheet_name = "发票明细";

    // 首先添加所有工作表到工作簿
    workbook.add_worksheet(); // 主工作表 (索引 0)

    // 如果需要明细，添加第二个工作表
    let has_detail = include_details;
    if has_detail {
        workbook.add_worksheet(); // 明细工作表 (索引 1)
    }

    // 设置工作表名称 (只能一次访问一个工作表)
    if let Ok(main_sheet) = workbook.worksheet_from_index(0) {
        main_sheet
            .set_name(main_sheet_name)
            .map_err(|e| format!("设置主工作表名称失败: {}", e))?;
    }

    if has_detail {
        if let Ok(detail_sheet) = workbook.worksheet_from_index(1) {
            detail_sheet
                .set_name(detail_sheet_name)
                .map_err(|e| format!("设置明细工作表名称失败: {}", e))?;
        }
    }

    // 设置字段对应的列宽
    let column_widths = [
        ("序号", 10),
        ("文件名", 30),
        ("状态", 10),
        ("发票代码", 20),
        ("发票号码", 20),
        ("开票日期", 15),
        ("购买方名称", 30),
        ("购买方税号", 25),
        ("购买方地址、电话", 40),
        ("购买方开户行账号", 40),
        ("销售方名称", 30),
        ("销售方税号", 25),
        ("销售方地址电话", 40),
        ("销售方开户行账号", 40),
        ("收款人", 15),
        ("复核人", 15),
        ("开票人", 15),
        ("金额", 15),
        ("税额", 15),
        ("价税合计", 15),
        ("备注", 30),
        ("重复信息", 20),
    ];

    // 设置主工作表列宽和表头
    if let Ok(worksheet) = workbook.worksheet_from_index(0) {
        // 根据导出字段设置列宽
        for (idx, field) in fields_to_export.iter().enumerate() {
            if let Some((_, width)) = column_widths.iter().find(|(name, _)| name == field) {
                worksheet
                    .set_column_width(idx as u16, *width)
                    .map_err(|e| format!("设置列宽失败: {}", e))?;
            }
        }

        // 写入汇总表头
        for (idx, field) in fields_to_export.iter().enumerate() {
            worksheet
                .write_string_with_format(0, idx as u16, field, &header_format.clone())
                .map_err(|e| format!("写入表头失败: {}", e))?;
        }
    }

    // 设置明细表列宽和表头
    if has_detail {
        if let Ok(worksheet) = workbook.worksheet_from_index(1) {
            // 设置明细表头
            worksheet
                .set_column_width(0, 10)
                .map_err(|e| format!("设置明细列宽失败: {}", e))?; // 序号
            worksheet
                .set_column_width(1, 25)
                .map_err(|e| format!("设置明细列宽失败: {}", e))?; // 发票日期
            worksheet
                .set_column_width(2, 25)
                .map_err(|e| format!("设置明细列宽失败: {}", e))?; // 发票号码
            worksheet
                .set_column_width(3, 40)
                .map_err(|e| format!("设置明细列宽失败: {}", e))?; // 项目名称
            worksheet
                .set_column_width(4, 15)
                .map_err(|e| format!("设置明细列宽失败: {}", e))?; // 数量
            worksheet
                .set_column_width(5, 15)
                .map_err(|e| format!("设置明细列宽失败: {}", e))?; // 单价
            worksheet
                .set_column_width(6, 15)
                .map_err(|e| format!("设置明细列宽失败: {}", e))?; // 金额
            worksheet
                .set_column_width(7, 15)
                .map_err(|e| format!("设置明细列宽失败: {}", e))?; // 税率
            worksheet
                .set_column_width(8, 15)
                .map_err(|e| format!("设置明细列宽失败: {}", e))?; // 税额

            // 写入明细表头
            worksheet
                .write_string_with_format(0, 0, "序号", &header_format.clone())
                .map_err(|e| format!("写入明细表头失败: {}", e))?;
            worksheet
                .write_string_with_format(0, 1, "发票日期", &header_format.clone())
                .map_err(|e| format!("写入明细表头失败: {}", e))?;
            worksheet
                .write_string_with_format(0, 2, "发票号码", &header_format.clone())
                .map_err(|e| format!("写入明细表头失败: {}", e))?;
            worksheet
                .write_string_with_format(0, 3, "项目名称", &header_format.clone())
                .map_err(|e| format!("写入明细表头失败: {}", e))?;
            worksheet
                .write_string_with_format(0, 4, "数量", &header_format.clone())
                .map_err(|e| format!("写入明细表头失败: {}", e))?;
            worksheet
                .write_string_with_format(0, 5, "单价", &header_format.clone())
                .map_err(|e| format!("写入明细表头失败: {}", e))?;
            worksheet
                .write_string_with_format(0, 6, "金额", &header_format.clone())
                .map_err(|e| format!("写入明细表头失败: {}", e))?;
            worksheet
                .write_string_with_format(0, 7, "税率", &header_format.clone())
                .map_err(|e| format!("写入明细表头失败: {}", e))?;
            worksheet
                .write_string_with_format(0, 8, "税额", &header_format.clone())
                .map_err(|e| format!("写入明细表头失败: {}", e))?;
        }
    }

    // 按照发票代码和发票号码分组，创建颜色组
    let mut duplicate_groups = std::collections::HashMap::new();

    for invoice in &processing_state.invoices {
        if invoice.status == "重复" {
            let key = format!("{}-{}", invoice.code, invoice.number);
            if !duplicate_groups.contains_key(&key) {
                duplicate_groups.insert(key, duplicate_group_count);
                // 创建对应颜色格式
                let color_index = duplicate_group_count % duplicate_colors.len();
                let format = Format::new()
                    .set_border(FormatBorder::Thin)
                    .set_background_color(duplicate_colors[color_index]);
                duplicate_group_formats.insert(duplicate_group_count, format);
                duplicate_group_count += 1;
            }
        }
    }

    // 写入汇总数据
    if let Ok(worksheet) = workbook.worksheet_from_index(0) {
        let mut row = 1;

        for invoice in &processing_state.invoices {
            // 确定格式
            let mut format = data_format.clone();
            if invoice.status == "重复" {
                let key = format!("{}-{}", invoice.code, invoice.number);
                if let Some(&group_id) = duplicate_groups.get(&key) {
                    if let Some(group_format) = duplicate_group_formats.get(&group_id) {
                        format = group_format.clone();
                    } else {
                        format = duplicate_format.clone();
                    }
                }
            }

            // 获取每个字段的值，根据字段名称
            for (idx, field) in fields_to_export.iter().enumerate() {
                match field.as_str() {
                    "序号" => {
                        worksheet
                            .write_number_with_format(
                                row,
                                idx as u16,
                                invoice.index as f64,
                                &format,
                            )
                            .map_err(|e| format!("写入序号失败: {}", e))?;
                    }
                    "文件名" => {
                        worksheet
                            .write_string_with_format(row, idx as u16, &invoice.filename, &format)
                            .map_err(|e| format!("写入文件名失败: {}", e))?;
                    }
                    "状态" => {
                        worksheet
                            .write_string_with_format(row, idx as u16, &invoice.status, &format)
                            .map_err(|e| format!("写入状态失败: {}", e))?;
                    }
                    "发票代码" => {
                        worksheet
                            .write_string_with_format(row, idx as u16, &invoice.code, &format)
                            .map_err(|e| format!("写入发票代码失败: {}", e))?;
                    }
                    "发票号码" => {
                        worksheet
                            .write_string_with_format(row, idx as u16, &invoice.number, &format)
                            .map_err(|e| format!("写入发票号码失败: {}", e))?;
                    }
                    "开票日期" => {
                        worksheet
                            .write_string_with_format(row, idx as u16, &invoice.date, &format)
                            .map_err(|e| format!("写入开票日期失败: {}", e))?;
                    }
                    "购买方名称" => {
                        worksheet
                            .write_string_with_format(row, idx as u16, &invoice.buyer.name, &format)
                            .map_err(|e| format!("写入购买方名称失败: {}", e))?;
                    }
                    "购买方税号" => {
                        worksheet
                            .write_string_with_format(
                                row,
                                idx as u16,
                                &invoice.buyer.tax_code,
                                &format,
                            )
                            .map_err(|e| format!("写入购买方税号失败: {}", e))?;
                    }
                    "购买方地址、电话" => {
                        worksheet
                            .write_string_with_format(
                                row,
                                idx as u16,
                                &invoice.buyer.address_phone,
                                &format,
                            )
                            .map_err(|e| format!("写入购买方地址、电话失败: {}", e))?;
                    }
                    "购买方开户行账号" => {
                        worksheet
                            .write_string_with_format(
                                row,
                                idx as u16,
                                &invoice.buyer.bank_account,
                                &format,
                            )
                            .map_err(|e| format!("写入购买方开户行账号失败: {}", e))?;
                    }
                    "销售方名称" => {
                        worksheet
                            .write_string_with_format(
                                row,
                                idx as u16,
                                &invoice.seller.name,
                                &format,
                            )
                            .map_err(|e| format!("写入销售方名称失败: {}", e))?;
                    }
                    "销售方税号" => {
                        worksheet
                            .write_string_with_format(
                                row,
                                idx as u16,
                                &invoice.seller.tax_code,
                                &format,
                            )
                            .map_err(|e| format!("写入销售方税号失败: {}", e))?;
                    }
                    "销售方地址电话" => {
                        worksheet
                            .write_string_with_format(
                                row,
                                idx as u16,
                                &invoice.seller.address_phone,
                                &format,
                            )
                            .map_err(|e| format!("写入销售方地址电话失败: {}", e))?;
                    }
                    "销售方开户行账号" => {
                        worksheet
                            .write_string_with_format(
                                row,
                                idx as u16,
                                &invoice.seller.bank_account,
                                &format,
                            )
                            .map_err(|e| format!("写入销售方开户行账号失败: {}", e))?;
                    }
                    "收款人" => {
                        worksheet
                            .write_string_with_format(row, idx as u16, &invoice.payee, &format)
                            .map_err(|e| format!("写入收款人失败: {}", e))?;
                    }
                    "复核人" => {
                        worksheet
                            .write_string_with_format(row, idx as u16, &invoice.reviewer, &format)
                            .map_err(|e| format!("写入复核人失败: {}", e))?;
                    }
                    "开票人" => {
                        worksheet
                            .write_string_with_format(row, idx as u16, &invoice.drawer, &format)
                            .map_err(|e| format!("写入开票人失败: {}", e))?;
                    }
                    "金额" => {
                        // 尝试将金额转换为数字，如果失败则保持字符串格式
                        match invoice.total_amount.parse::<f64>() {
                            Ok(amount) => {
                                worksheet
                                    .write_number_with_format(row, idx as u16, amount, &format)
                                    .map_err(|e| format!("写入金额失败: {}", e))?;
                            }
                            Err(_) => {
                                worksheet
                                    .write_string_with_format(
                                        row,
                                        idx as u16,
                                        &invoice.total_amount,
                                        &format,
                                    )
                                    .map_err(|e| format!("写入金额失败: {}", e))?;
                            }
                        }
                    }
                    "税额" => {
                        // 尝试将税额转换为数字，如果失败则保持字符串格式
                        match invoice.total_tax.parse::<f64>() {
                            Ok(tax) => {
                                worksheet
                                    .write_number_with_format(row, idx as u16, tax, &format)
                                    .map_err(|e| format!("写入税额失败: {}", e))?;
                            }
                            Err(_) => {
                                worksheet
                                    .write_string_with_format(
                                        row,
                                        idx as u16,
                                        &invoice.total_tax,
                                        &format,
                                    )
                                    .map_err(|e| format!("写入税额失败: {}", e))?;
                            }
                        }
                    }
                    "价税合计" => {
                        // 尝试将价税合计转换为数字，如果失败则保持字符串格式
                        match invoice.total_amount_tax.parse::<f64>() {
                            Ok(total) => {
                                worksheet
                                    .write_number_with_format(row, idx as u16, total, &format)
                                    .map_err(|e| format!("写入价税合计失败: {}", e))?;
                            }
                            Err(_) => {
                                worksheet
                                    .write_string_with_format(
                                        row,
                                        idx as u16,
                                        &invoice.total_amount_tax,
                                        &format,
                                    )
                                    .map_err(|e| format!("写入价税合计失败: {}", e))?;
                            }
                        }
                    }
                    "备注" => {
                        worksheet
                            .write_string_with_format(row, idx as u16, &invoice.remark, &format)
                            .map_err(|e| format!("写入备注失败: {}", e))?;
                    }
                    "重复信息" => {
                        worksheet
                            .write_string_with_format(
                                row,
                                idx as u16,
                                &invoice.duplicate_info,
                                &format,
                            )
                            .map_err(|e| format!("写入重复信息失败: {}", e))?;
                    }
                    _ => {}
                }
            }

            row += 1;
        }
    }

    // 如果启用了明细导出功能，则写入明细表
    if has_detail {
        if let Ok(worksheet) = workbook.worksheet_from_index(1) {
            // 明细工作表中写入数据
            let mut row: u32 = 1;

            for invoice in &processing_state.invoices {
                if !invoice.items.is_empty() {
                    // 每个发票和它的商品作为一组
                    let invoice_row_start = row;
                    let invoice_row_end = invoice_row_start + invoice.items.len() as u32 - 1;

                    // 写入发票基本信息（可能跨多行）
                    if invoice_row_start < invoice_row_end {
                        // 合并单元格
                        worksheet
                            .merge_range(
                                invoice_row_start,
                                0,
                                invoice_row_end,
                                0,
                                &invoice.index.to_string(),
                                &data_format,
                            )
                            .map_err(|e| format!("合并单元格失败: {}", e))?;

                        worksheet
                            .merge_range(
                                invoice_row_start,
                                1,
                                invoice_row_end,
                                1,
                                &invoice.date,
                                &data_format,
                            )
                            .map_err(|e| format!("合并单元格失败: {}", e))?;

                        worksheet
                            .merge_range(
                                invoice_row_start,
                                2,
                                invoice_row_end,
                                2,
                                &invoice.number,
                                &data_format,
                            )
                            .map_err(|e| format!("合并单元格失败: {}", e))?;
                    } else {
                        // 单行直接写入
                        worksheet
                            .write_string_with_format(
                                row,
                                0,
                                &invoice.index.to_string(),
                                &data_format,
                            )
                            .map_err(|e| format!("写入序号失败: {}", e))?;

                        worksheet
                            .write_string_with_format(row, 1, &invoice.date, &data_format)
                            .map_err(|e| format!("写入发票日期失败: {}", e))?;

                        worksheet
                            .write_string_with_format(row, 2, &invoice.number, &data_format)
                            .map_err(|e| format!("写入发票号码失败: {}", e))?;
                    }

                    // 写入每个商品明细
                    for (i, item) in invoice.items.iter().enumerate() {
                        let current_row = invoice_row_start + i as u32;

                        // 项目名称
                        worksheet
                            .write_string_with_format(current_row, 3, &item.name, &data_format)
                            .map_err(|e| format!("写入项目名称失败: {}", e))?;

                        // 尝试将数量转换为数字类型
                        if let Ok(quantity) = item.quantity.parse::<f64>() {
                            worksheet
                                .write_number_with_format(current_row, 4, quantity, &data_format)
                                .map_err(|e| format!("写入数量失败: {}", e))?;
                        } else {
                            worksheet
                                .write_string_with_format(
                                    current_row,
                                    4,
                                    &item.quantity,
                                    &data_format,
                                )
                                .map_err(|e| format!("写入数量失败: {}", e))?;
                        }

                        // 尝试将单价转换为数字类型
                        if let Ok(price) = item.price.parse::<f64>() {
                            worksheet
                                .write_number_with_format(current_row, 5, price, &data_format)
                                .map_err(|e| format!("写入单价失败: {}", e))?;
                        } else {
                            worksheet
                                .write_string_with_format(current_row, 5, &item.price, &data_format)
                                .map_err(|e| format!("写入单价失败: {}", e))?;
                        }

                        // 尝试将金额转换为数字类型
                        if let Ok(amount) = item.amount.parse::<f64>() {
                            worksheet
                                .write_number_with_format(current_row, 6, amount, &data_format)
                                .map_err(|e| format!("写入金额失败: {}", e))?;
                        } else {
                            worksheet
                                .write_string_with_format(
                                    current_row,
                                    6,
                                    &item.amount,
                                    &data_format,
                                )
                                .map_err(|e| format!("写入金额失败: {}", e))?;
                        }

                        // 税率
                        worksheet
                            .write_string_with_format(current_row, 7, &item.tax_rate, &data_format)
                            .map_err(|e| format!("写入税率失败: {}", e))?;

                        // 尝试将税额转换为数字类型
                        if let Ok(tax) = item.tax.parse::<f64>() {
                            worksheet
                                .write_number_with_format(current_row, 8, tax, &data_format)
                                .map_err(|e| format!("写入税额失败: {}", e))?;
                        } else {
                            worksheet
                                .write_string_with_format(current_row, 8, &item.tax, &data_format)
                                .map_err(|e| format!("写入税额失败: {}", e))?;
                        }
                    }

                    // 更新行号
                    row = invoice_row_end + 1;
                }
            }
        }
    }

    // 保存Excel文件，使用提供的文件名
    let excel_path = output_path.join(format!("{}.xlsx", file_name));
    workbook
        .save(&excel_path)
        .map_err(|e| format!("保存Excel文件失败: {}", e))?;

    // 打开Excel文件
    APP.get()
        .unwrap()
        .opener()
        .open_path(excel_path.to_str().unwrap(), Option::<String>::None)
        .map_err(|e| format!("打开Excel文件失败: {}", e))?;

    Ok(())
}

#[tauri::command]
fn set_invoices(invoices: Vec<Invoice>, state: State<AppState>) -> Result<(), String> {
    let mut processing_state = state
        .lock()
        .map_err(|_| "Failed to lock state".to_string())?;

    processing_state.invoices = invoices;

    // 更新统计状态
    let mut total_amount = 0.0;
    let mut total_tax = 0.0;
    let mut success_count = 0;
    let mut duplicate_count = 0;
    let mut fail_count = 0;

    for invoice in &processing_state.invoices {
        match invoice.status.as_str() {
            "正常" => {
                success_count += 1;
                if let Ok(amount) = invoice.total_amount.parse::<f64>() {
                    total_amount += amount;
                }
                if let Ok(tax) = invoice.total_tax.parse::<f64>() {
                    total_tax += tax;
                }
            }
            "重复" => duplicate_count += 1,
            "解析失败" => fail_count += 1,
            _ => {}
        }
    }

    processing_state.stats.invoice_count = processing_state.invoices.len();
    processing_state.stats.success_count = success_count;
    processing_state.stats.duplicate_count = duplicate_count;
    processing_state.stats.fail_count = fail_count;
    processing_state.stats.total_amount = format!("{:.2}", total_amount);
    processing_state.stats.total_tax = format!("{:.2}", total_tax);

    Ok(())
}

// 读取文件内容返回字节数组
#[tauri::command]
fn read_file_to_bytes(path: &str) -> Result<Vec<u8>, String> {
    let bytes = fs::read(path).map_err(|e| format!("无法读取文件: {}", e))?;
    Ok(bytes)
}

// 打开PDF文件
#[tauri::command]
async fn open_pdf_file(path: &str) -> Result<(), String> {
    APP.get()
        .unwrap()
        .opener()
        .open_path(path, Option::<String>::None)
        .map_err(|e| format!("打开PDF文件失败: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let processing_state: AppState = Arc::new(Mutex::new(ProcessingState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {

            // 在应用启动时初始化 APP
            APP.set(app.handle().clone()).unwrap();
            
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
              update(handle).await.unwrap();
            });
            Ok(())
        })
        .manage(processing_state)
        .invoke_handler(tauri::generate_handler![
            select_output_path,
            export_results,
            set_invoices,
            read_file_to_bytes,
            parse_invoice_text,
            open_pdf_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
