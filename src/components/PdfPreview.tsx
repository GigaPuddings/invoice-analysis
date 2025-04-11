import React, { useEffect, useRef, useState, MouseEvent } from 'react';
import { Modal, Button, Spin, message, Tooltip } from 'antd';
import * as pdfjs from 'pdfjs-dist';
import { invoke } from '@tauri-apps/api/core';
import Draggable from 'react-draggable';
import { 
  ZoomInOutlined, 
  ZoomOutOutlined, 
  CloseOutlined,
  RedoOutlined,
} from '@ant-design/icons';

// 确保PDF.js worker路径正确设置
pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs-5.1.91-dist/build/pdf.worker.mjs';

// 最小和最大缩放比例
const MIN_SCALE = 0.5; // 减小最小缩放比例
const MAX_SCALE = 5.0;
const SCALE_STEP = 0.25;
// 默认增强清晰度因子，提高渲染质量
const QUALITY_FACTOR = 0.8; // 减小清晰度因子，避免默认缩放过大

interface PdfPreviewProps {
  visible: boolean;
  onClose: () => void;
  filename: string;
}

// 修改全局样式
const modalStyles = {
  content: {
    padding: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // 使用半透明白色背景
    width: '60vw',
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    color: '#222',
    borderBottom: '1px solid #eee',
    cursor: 'move', // 添加移动光标样式
    width: '100%',
  },
  title: {
    color: '#222',
    width: '100%', // 确保标题栏宽度100%
  },
  body: {
    padding: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: 'calc(100vh - 100px)',
    overflow: 'hidden',
    borderRadius: '0 0 8px 8px', // 添加圆角效果
    width: '100%',
  },
  wrapper: {
    overflow: 'hidden',
  },
  footer: {
    display: 'none',
  },
};

const PdfPreview: React.FC<PdfPreviewProps> = ({ visible, onClose, filename }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1.0);
  const [initialScale, setInitialScale] = useState<number>(1.0);
  const [pageCount, setPageCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [ _messageApi, contextHolder] = message.useMessage();
  
  // 拖拽相关状态
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionRef = useRef({ x: 0, y: 0 });
  
  // 添加Modal拖拽状态
  const draggleRef = useRef<HTMLDivElement>(null);
  
  // 保存已加载的PDF文档
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const currentFileRef = useRef<string>("");
  const pageRef = useRef<pdfjs.PDFPageProxy | null>(null);
  const renderingRef = useRef<boolean>(false); // 防止重复渲染

  // 清理函数
  const cleanup = () => {
    // 清理之前加载的PDF文档
    if (pdfDocRef.current) {
      pdfDocRef.current.destroy();
      pdfDocRef.current = null;
    }
    if (pageRef.current) {
      pageRef.current.cleanup();
      pageRef.current = null;
    }
    currentFileRef.current = "";
    setPageCount(0);
    setCurrentPage(1);
    setScale(1.0);
    setPosition({ x: 0, y: 0 });
    positionRef.current = { x: 0, y: 0 };
    renderingRef.current = false;
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => cleanup();
  }, []);

  // 当显示状态或文件名变化时加载PDF
  useEffect(() => {
    if (visible && filename) {
      // 如果已经加载了相同的文件，不需要重新加载
      if (filename === currentFileRef.current && pdfDocRef.current) {
        console.log("文件已加载，重新渲染当前页面");
        // 延迟渲染，确保Modal完全打开
        setTimeout(() => {
          renderPage(currentPage);
        }, 100);
      } else {
        // 加载新文件
        console.log("加载新文件");
        loadPdfFile();
      }
    }
  }, [visible, filename]);

  // 当缩放比例变化时重新渲染
  useEffect(() => {
    if (visible && pdfDocRef.current) {
      renderPage(currentPage);
    }
  }, [scale]);

  // 确保容器大小变化时重新渲染
  useEffect(() => {
    const handleResize = () => {
      if (visible && pdfDocRef.current && pageRef.current) {
        // 重新计算合适的缩放比例
        calculateFitScale(pageRef.current);
      }
    };

    // 添加尺寸观察器监测容器大小变化
    let resizeObserver: ResizeObserver | null = null;
    if (visible && containerRef.current) {
      try {
        resizeObserver = new ResizeObserver(() => {
          if (pdfDocRef.current && pageRef.current && !renderingRef.current) {
            console.log("检测到容器尺寸变化，重新计算缩放");
            calculateFitScale(pageRef.current);
          }
        });
        resizeObserver.observe(containerRef.current);
      } catch (err) {
        console.error("创建ResizeObserver失败:", err);
      }
    }

    window.addEventListener('resize', handleResize);
    
    // 首次加载后单次尝试渲染
    if (visible && containerRef.current) {
      if (pdfDocRef.current && pageRef.current) {
        console.log("首次加载后单次尝试渲染");
        // setTimeout(() => {
          if (!renderingRef.current) {
            renderPage(currentPage);
          }
        // }, 200);
      }
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [visible, containerRef.current]);

  // 规范化文件路径
  const normalizePath = (path: string): string => {
    // 去除文件协议前缀（如果有）
    let normalizedPath = path.replace(/^file:\/\//, '');
    
    // 确保在Windows上使用正确的路径分隔符
    normalizedPath = normalizedPath.replace(/\//g, '\\');
    
    // 确保路径不以反斜杠开头（但保留盘符前的反斜杠）
    if (normalizedPath.startsWith('\\') && !normalizedPath.match(/^\\[a-zA-Z]:\\/)) {
      normalizedPath = normalizedPath.substring(1);
    }
    
    return normalizedPath;
  };

  // 计算适合容器的缩放比例
  const calculateFitScale = (page: pdfjs.PDFPageProxy): number => {
    if (!containerRef.current) return 1.0;
    
    const viewport = page.getViewport({ scale: 1.0 });
    const containerWidth = containerRef.current.clientWidth - 40; // 减去内边距
    const containerHeight = containerRef.current.clientHeight - 40;
    
    // 计算宽度和高度的缩放比例
    const scaleX = containerWidth / viewport.width;
    const scaleY = containerHeight / viewport.height;
    
    // 使用较小的缩放比例，确保整个页面都可见
    const fitScale = Math.min(scaleX, scaleY);
    
    // 确保最小缩放不低于一个阈值，以保证文本清晰
    // 提高缩放因子，使文本更清晰
    const scaleFactor = Math.max(fitScale * QUALITY_FACTOR, MIN_SCALE);
    
    console.log(`计算适合缩放: 原始尺寸=${viewport.width}x${viewport.height}, 容器=${containerWidth}x${containerHeight}, 比例=${scaleFactor}`);
    
    // 更新初始缩放比例
    setInitialScale(scaleFactor);
    setScale(scaleFactor);
    
    return scaleFactor;
  };

  const loadPdfFile = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 清理之前的文档
      cleanup();
      
      // 规范化文件路径
      const normalizedPath = normalizePath(filename);
      console.log(`尝试加载PDF文件: ${normalizedPath}`);
      
      currentFileRef.current = normalizedPath;

      // 使用Tauri API读取文件
      console.log(`开始读取文件: ${normalizedPath}`);
      try {
        const fileBytes = await invoke<number[]>('read_file_to_bytes', {
          path: normalizedPath,
        });

        console.log(`文件读取成功，大小: ${fileBytes.length} 字节`);
        
        // 将字节数组转换为ArrayBuffer
        const fileArrayBuffer = new Uint8Array(fileBytes).buffer;

        // 加载PDF文档
        console.log('开始加载PDF文档...');
        const pdf = await pdfjs.getDocument({
          data: fileArrayBuffer,
          cMapUrl: '/pdfjs-5.1.91-dist/web/cmaps/',
          cMapPacked: true,
        }).promise;

        console.log(`PDF文档加载成功，共 ${pdf.numPages} 页`);
        
        // 保存PDF文档引用
        pdfDocRef.current = pdf;
        setPageCount(pdf.numPages);
        
        if (pdf.numPages > 0) {
          // 获取第一页以计算适合的缩放比例
          const page = await pdf.getPage(1);
          pageRef.current = page;
          
          // 计算适合的缩放比例
          const initialScale = calculateFitScale(page);
          
          // 强制设置状态
          setScale(initialScale);
          setCurrentPage(1);
          
          // 延迟单次渲染
          // setTimeout(() => {
            if (!renderingRef.current) {
              renderPage(1);
            }
          // }, 200);
        } else {
          setError('PDF文件没有页面');
          setLoading(false);
        }
      } catch (readError) {
        console.error('读取文件失败:', readError);
        setError(`无法读取文件: ${readError}`);
        setLoading(false);
      }
    } catch (err) {
      console.error('加载PDF文件失败:', err);
      setError(`加载PDF文件失败: ${err}`);
      setLoading(false);
    }
  };

  const renderPage = async (pageNumber: number) => {
    if (!pdfDocRef.current) {
      console.log("渲染页面失败：PDF文档未加载");
      return;
    }
    
    if (renderingRef.current) {
      console.log("已有渲染进程正在进行，跳过本次渲染");
      return;
    }
    
    try {
      // 设置渲染标志，防止重复渲染
      renderingRef.current = true;
      setLoading(true);
      setCurrentPage(pageNumber);
      
      if (canvasContainerRef.current) {
        // 清空容器
        console.log("清空画布容器");
        canvasContainerRef.current.innerHTML = '';
      } else {
        console.warn("画布容器不存在，渲染可能失败");
      }

      console.log(`开始渲染第 ${pageNumber} 页，缩放比例: ${scale}`);
      
      // 获取页面
      const page = await pdfDocRef.current.getPage(pageNumber);
      pageRef.current = page;
      
      // 使用Canvas渲染
      const viewport = page.getViewport({ scale });
      
      // 创建Canvas元素 - 使用设备像素比来提高清晰度
      const pixelRatio = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });
      
      if (!context) {
        throw new Error("无法创建Canvas 2D上下文");
      }
      
      // 设置Canvas尺寸 - 乘以设备像素比提高清晰度
      canvas.width = viewport.width * pixelRatio;
      canvas.height = viewport.height * pixelRatio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.style.display = 'block';
      
      // 设置比例转换
      context.scale(pixelRatio, pixelRatio);
      
      // 渲染PDF页面到Canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        enableWebGL: true, // 启用WebGL渲染，提高性能
        intent: 'display', // 显示意图
      };
      
      // 渲染页面
      console.log('开始页面渲染...');
      
      // 在添加到DOM前设置canvas可见
      canvas.style.visibility = 'visible';
      canvas.style.opacity = '1';
      
      // 添加到DOM
      if (canvasContainerRef.current) {
        canvasContainerRef.current.appendChild(canvas);
        
        // 强制浏览器重绘
        canvasContainerRef.current.style.display = 'none';
        // 触发reflow
        void canvasContainerRef.current.offsetHeight;
        canvasContainerRef.current.style.display = 'block';
      } else {
        throw new Error("找不到canvas容器");
      }
      
      // 现在执行渲染
      const renderTask = page.render(renderContext);
      await renderTask.promise;
      
      console.log('页面渲染完成');
      
      setLoading(false);
      renderingRef.current = false; // 完成渲染，重置标志
    } catch (err) {
      console.error('渲染PDF页面失败:', err);
      setError(`渲染PDF页面失败: ${err}`);
      setLoading(false);
      renderingRef.current = false; // 出错时也要重置标志
    }
  };

  const changePage = async (newPage: number) => {
    if (newPage < 1 || newPage > pageCount) return;
    // 重置位置
    setPosition({ x: 0, y: 0 });
    positionRef.current = { x: 0, y: 0 };
    renderPage(newPage);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + SCALE_STEP, MAX_SCALE));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - SCALE_STEP, MIN_SCALE));
  };

  // 重置缩放和位置
  const handleReset = () => {
    setScale(initialScale);
    setPosition({ x: 0, y: 0 });
    positionRef.current = { x: 0, y: 0 };
  };

  // 鼠标滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    // 使用Ctrl键+滚轮进行缩放
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale + delta));
      setScale(newScale);
    }
  };

  // 拖拽相关函数
  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return; // 只处理左键点击
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    
    const newPosition = {
      x: positionRef.current.x + dx,
      y: positionRef.current.y + dy,
    };
    
    setPosition(newPosition);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    positionRef.current = newPosition;
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (isDragging) {
      e.stopPropagation();
      setIsDragging(false);
    }
  };

  const handleMouseLeave = (e: MouseEvent) => {
    if (isDragging) {
      e.stopPropagation();
      setIsDragging(false);
    }
  };

  // 关闭模态框时的处理
  const handleClose = () => {
    onClose();
  };

  return (
    <>
      {contextHolder}
      <Modal
        title={
          <div 
            className="flex justify-between items-center px-2 py-[2px] rounded-t-lg select-none cursor-move w-full"
            >
            {/* 顶部工具栏 */}
            <div>
              {pageCount > 0 && `第 ${currentPage} 页，共 ${pageCount} 页`}
            </div>
            <div className="flex gap-2">
              <Tooltip title="上一页">
                <Button 
                  type="text" 
                  icon={<span className="text-gray-800">←</span>} 
                  onClick={() => changePage(currentPage - 1)} 
                  disabled={currentPage <= 1}
                  className="text-gray-800 hover:text-blue-500"
                />
              </Tooltip>
              <Tooltip title="下一页">
                <Button 
                  type="text" 
                  icon={<span className="text-gray-800">→</span>} 
                  onClick={() => changePage(currentPage + 1)} 
                  disabled={currentPage >= pageCount}
                  className="text-gray-800 hover:text-blue-500"
                />
              </Tooltip>
              <Tooltip title="缩小">
                <Button 
                  type="text" 
                  icon={<ZoomOutOutlined className="text-gray-800" />} 
                  onClick={handleZoomOut}
                  className="text-gray-800 hover:text-blue-500"
                />
              </Tooltip>
              <Tooltip title="放大">
                <Button 
                  type="text" 
                  icon={<ZoomInOutlined className="text-gray-800" />} 
                  onClick={handleZoomIn}
                  className="text-gray-800 hover:text-blue-500"
                />
              </Tooltip>
              <Tooltip title="重置">
                <Button 
                  type="text" 
                  icon={<RedoOutlined className="text-gray-800" />} 
                  onClick={handleReset}
                  className="text-gray-800 hover:text-blue-500"
                />
              </Tooltip>
              <Tooltip title="关闭">
                <Button 
                  type="text" 
                  icon={<CloseOutlined className="text-gray-800" />} 
                  onClick={handleClose}
                  className="text-gray-800 hover:text-red-500"
                />
              </Tooltip>
            </div>
          </div>
        }
        maskClosable={false}
        mask={false}
        closable={false}
        open={visible}
        onCancel={handleClose}
        footer={null}
        width="60%"
        style={{ top: 60, width: '60vw', pointerEvents: 'none' }}
        styles={modalStyles}
        className="pdf-preview-modal"
        rootClassName="pdf-preview-modal-root"
        destroyOnClose
        modalRender={(modal) => (
          <Draggable
            handle=".ant-modal-header" // 只允许通过标题栏拖拽
            defaultClassName="pdf-preview-draggable"
            defaultPosition={{x: 0, y: 0}}
            scale={1}
            grid={[5, 5]} // 增大网格值以减少拖拽灵敏度
          >
            <div 
              ref={draggleRef} 
              className="draggable-modal-container"
              style={{
                position: 'relative',
                background: 'transparent',
                pointerEvents: 'none', // 允许点击穿透
              }}
            >
              {modal}
            </div>
          </Draggable>
        )}
      >
        <div 
          ref={containerRef} 
          className="w-full h-full flex flex-col"
          style={{ 
            minHeight: 'calc(100vh - 180px)',
            maxHeight: 'calc(100vh - 180px)',
            backgroundColor: 'rgba(255, 255, 255, 0.1)'
          }}
          onWheel={handleWheel}
        >
          {/* 加载状态 */}
          {loading && (
            <div className="absolute inset-0 flex justify-center items-center z-10">
              <Spin tip="正在加载PDF..." />
            </div>
          )}
          
          {/* 错误信息 */}
          {error && (
            <div className="absolute inset-0 flex justify-center items-center z-10">
              <div className="text-red-500 text-center py-4 bg-white bg-opacity-80 p-4 rounded">
                {error}
              </div>
            </div>
          )}
          
          {/* PDF内容区域 - 可拖拽 */}
          <div 
            className="flex-1 overflow-hidden relative flex justify-center items-center"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            style={{ 
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
          >
            <div
              ref={canvasContainerRef}
              style={{
                transform: `translate(${position.x}px, ${position.y}px)`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              }}
            />
          </div>
          
          {/* 底部信息栏 */}
          <div className="flex justify-between items-center p-2 text-gray-800 bg-white bg-opacity-90">
            <div className="text-sm">
              {`缩放: ${(scale * 100).toFixed(0)}%`}
            </div>
            <div className="text-xs text-gray-500">
              提示: 拖拽可移动，Ctrl+滚轮可缩放
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default PdfPreview; 
