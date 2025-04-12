import React, { useEffect, useRef, useState, MouseEvent } from 'react';
import { Modal, Button, Spin, message, Tooltip } from 'antd';
import * as pdfjs from 'pdfjs-dist';
import { invoke } from '@tauri-apps/api/core';
import Draggable from 'react-draggable';
import { Resizable, ResizeCallback } from 're-resizable';
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

// 添加窗口调整大小限制
const MIN_WIDTH = 400; // 最小宽度
const MIN_HEIGHT = 300; // 最小高度
const MAX_WIDTH = '90vw'; // 最大宽度
const MAX_HEIGHT = '90vh'; // 最大高度
const DEFAULT_WIDTH = '60vw'; // 默认宽度
const DEFAULT_HEIGHT = 'calc(100vh - 300px)'; // 默认高度

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
    width: '100%', // 让内容自适应Resizable容器大小
    height: '100%', // 让内容自适应Resizable容器大小
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    color: '#222',
    marginBottom: 0,
    borderBottom: '1px solid #eee',
    cursor: 'move',
    width: '100%',
  },
  title: {
    color: '#222',
    width: '100%',
  },
  body: {
    padding: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '100%',
    height: 'calc(100% - 36px)',
    overflow: 'hidden',
    borderRadius: '0 0 8px 8px',
    width: '100%',
  },
  wrapper: {
    overflow: 'hidden',
    height: '100%',
  },
  footer: {
    display: 'none',
  },
};

// 调整大小手柄的样式
const resizeHandleStyles = {
  top: {
    zIndex: 1000,
    height: '10px',
    width: '100%',
    cursor: 'n-resize',
    backgroundColor: 'transparent',
    position: 'absolute' as const,
    top: 0,
  },
  right: {
    zIndex: 1000,
    height: '100%',
    width: '10px',
    cursor: 'e-resize',
    backgroundColor: 'transparent',
    position: 'absolute' as const,
    right: 0,
  },
  bottom: {
    zIndex: 1000,
    height: '10px',
    width: '100%',
    cursor: 's-resize',
    backgroundColor: 'transparent',
    position: 'absolute' as const,
    bottom: 0,
  },
  left: {
    zIndex: 1000,
    height: '100%',
    width: '10px',
    cursor: 'w-resize',
    backgroundColor: 'transparent',
    position: 'absolute' as const,
    left: 0,
  },
  topRight: {
    zIndex: 1000,
    height: '20px',
    width: '20px',
    cursor: 'ne-resize',
    backgroundColor: 'transparent',
    position: 'absolute' as const,
    right: 0,
    top: 0,
  },
  bottomRight: {
    zIndex: 1000,
    height: '20px',
    width: '20px',
    cursor: 'se-resize',
    backgroundColor: 'transparent',
    position: 'absolute' as const,
    right: 0,
    bottom: 0,
  },
  bottomLeft: {
    zIndex: 1000,
    height: '20px',
    width: '20px',
    cursor: 'sw-resize',
    backgroundColor: 'transparent',
    position: 'absolute' as const,
    left: 0,
    bottom: 0,
  },
  topLeft: {
    zIndex: 1000,
    height: '20px',
    width: '20px',
    cursor: 'nw-resize',
    backgroundColor: 'transparent',
    position: 'absolute' as const,
    left: 0,
    top: 0,
  },
};

const PdfPreview: React.FC<PdfPreviewProps> = ({ visible, onClose, filename }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1.0);
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
  
  // 添加窗口尺寸状态
  const [windowDimensions, setWindowDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  
  // 跟踪弹窗初始位置和尺寸
  const [modalBounds, setModalBounds] = useState({
    initialTop: 60, // Modal的初始top位置
    headerHeight: 36, // Modal头部高度
  });
  
  // 添加Modal拖拽状态
  const draggleRef = useRef<HTMLDivElement>(null);
  
  // 保存已加载的PDF文档
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const currentFileRef = useRef<string>("");
  const pageRef = useRef<pdfjs.PDFPageProxy | null>(null);
  const renderingRef = useRef<boolean>(false); // 防止重复渲染
  
  // 添加窗口大小状态
  const [windowSize, setWindowSize] = useState({
    width: DEFAULT_WIDTH as string | number,
    height: DEFAULT_HEIGHT as string | number,
  });
  
  // 添加调整大小状态
  const [isResizing, setIsResizing] = useState(false);
  
  // 添加对Resizable组件的引用
  const resizableRef = useRef<Resizable>(null);

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

  // 监听窗口尺寸变化
  useEffect(() => {
    const handleWindowResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  // 当Modal渲染后，测量并更新其实际尺寸
  useEffect(() => {
    if (visible && draggleRef.current) {
      // 延迟执行，确保DOM已完全渲染
      setTimeout(() => {
        const headerElement = draggleRef.current?.querySelector('.ant-modal-header');
        if (headerElement) {
          const headerHeight = headerElement.clientHeight;
          setModalBounds(prev => ({
            ...prev,
            headerHeight
          }));
        }
      }, 100);
    }
  }, [visible]);

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
        if (!renderingRef.current) {
          renderPage(currentPage);
        }
      }
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [visible, containerRef.current]);
  
  // 处理窗口调整大小开始
  const handleResizeStart = () => {
    setIsResizing(true);
  };
  
  // 处理窗口调整大小结束
  const handleResizeStop = () => {
    setIsResizing(false);
    // 调整大小后重新渲染PDF
    if (pdfDocRef.current && pageRef.current) {
      // 延迟一点时间确保容器大小已更新
      setTimeout(() => {
        if (pageRef.current) {
          calculateFitScale(pageRef.current);
        }
      }, 100);
    }
  };

  // 实时调整大小处理
  const handleResize: ResizeCallback = (_e, _direction, ref, d) => {
    // 实时更新大小状态
    setWindowSize({
      width: windowSize.width === DEFAULT_WIDTH 
        ? ref.style.width || DEFAULT_WIDTH 
        : typeof windowSize.width === 'number'
          ? (windowSize.width as number) + d.width
          : ref.style.width || DEFAULT_WIDTH,
      height: windowSize.height === DEFAULT_HEIGHT
        ? ref.style.height || DEFAULT_HEIGHT
        : typeof windowSize.height === 'number'
          ? (windowSize.height as number) + d.height
          : ref.style.height || DEFAULT_HEIGHT,
    });
    
    // 如果有PDF文档页面且不在渲染中，尝试重新计算合适的缩放比例
    if (pdfDocRef.current && pageRef.current && !renderingRef.current) {
      calculateFitScale(pageRef.current);
    }
  };

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
    if (!containerRef.current) {
      console.warn("计算缩放比例失败：容器不存在");
      return MIN_SCALE;
    }
    
    const viewport = page.getViewport({ scale: 1.0 });
    const containerWidth = containerRef.current.clientWidth - 40; // 减去内边距
    const containerHeight = containerRef.current.clientHeight - 40;
    
    console.log(`容器尺寸: ${containerWidth}x${containerHeight}, PDF尺寸: ${viewport.width}x${viewport.height}`);
    
    // 计算宽度和高度的缩放比例
    const scaleX = containerWidth / viewport.width;
    const scaleY = containerHeight / viewport.height;
    
    // 使用较小的缩放比例，确保整个页面都可见
    const fitScale = Math.min(scaleX, scaleY);
    
    // 确保最小缩放不低于一个阈值，以保证文本清晰
    // 提高缩放因子，使文本更清晰
    const scaleFactor = Math.max(fitScale * QUALITY_FACTOR, MIN_SCALE);
    
    console.log(`计算适合缩放: scaleX=${scaleX}, scaleY=${scaleY}, 最终比例=${scaleFactor}`);
    
    setScale(scaleFactor);
    
    return scaleFactor;
  };

  const loadPdfFile = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 重置状态
      setPosition({ x: 0, y: 0 });
      positionRef.current = { x: 0, y: 0 };
      
      // 判断是否为重新加载当前文件
      const isReloading = currentFileRef.current === filename;
      
      // 规范化文件路径
      const normalizedPath = normalizePath(isReloading ? currentFileRef.current : filename);
      console.log(`尝试加载PDF文件: ${normalizedPath}, 是否重新加载: ${isReloading}`);
      
      // 如果非重新加载，清理之前的文档
      if (!isReloading) {
        cleanup();
      }
      
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
          
          // 计算适合的缩放比例 - 确保获取最新的容器尺寸
          setTimeout(() => {
            if (pageRef.current) {
              // 计算适合的缩放比例
              calculateFitScale(pageRef.current);
              
              // 设置初始页码
              setCurrentPage(1);
              
              // 延迟一点再渲染，确保缩放比例已更新
              setTimeout(() => {
                if (!renderingRef.current) {
                  console.log(`开始渲染第1页，使用计算的缩放比例: ${scale}`);
                  renderPage(1);
                }
              }, 100);
            }
          }, 100);
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
    console.log("开始执行重置操作...");
    
    // 先标记加载状态，显示加载中
    setLoading(true);
    
    // 停止任何正在进行的渲染
    renderingRef.current = false;
    
    // 完全清理当前PDF资源
    if (pageRef.current) {
      try {
        pageRef.current.cleanup();
        pageRef.current = null;
      } catch (e) {
        console.error("清理页面失败:", e);
      }
    }
    
    // 重置位置
    setPosition({ x: 0, y: 0 });
    positionRef.current = { x: 0, y: 0 };
    
    // 重置窗口尺寸到默认值
    setWindowSize({
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT
    });
    
    // 强制重置Resizable组件大小
    if (resizableRef.current) {
      try {
        // 通过直接操作style属性强制更新尺寸
        const resizableElement = resizableRef.current as any;
        if (resizableElement.resizable) {
          resizableElement.resizable.style.width = typeof DEFAULT_WIDTH === 'number' ? 
            `${DEFAULT_WIDTH}px` : DEFAULT_WIDTH;
          resizableElement.resizable.style.height = typeof DEFAULT_HEIGHT === 'number' ? 
            `${DEFAULT_HEIGHT}px` : DEFAULT_HEIGHT;
          
          console.log("已重置Resizable大小:", DEFAULT_WIDTH, DEFAULT_HEIGHT);
        }
      } catch (error) {
        console.error("重置尺寸时出错:", error);
      }
    }
    
    // 强制清空PDF渲染容器
    if (canvasContainerRef.current) {
      canvasContainerRef.current.innerHTML = '';
      console.log("已清空渲染容器");
    }
    
    // 使用更长的延迟时间确保DOM已更新
    setTimeout(() => {
      console.log("开始重新加载PDF...");
      
      // 如果当前有文件，重新加载它
      if (currentFileRef.current && pdfDocRef.current) {
        
        // 清理当前PDF文档
        try {
          if (pdfDocRef.current) {
            pdfDocRef.current.destroy();
            pdfDocRef.current = null;
          }
        } catch (e) {
          console.error("清理PDF文档失败:", e);
        }
        
        // 重置当前文件引用，强制重新加载
        currentFileRef.current = "";
        
        // 等待DOM更新完成后重新加载文件
        setTimeout(() => {
          console.log("执行文件重新加载...");
          loadPdfFile(); // 重新加载当前PDF文件
        }, 100);
      } else {
        // 如果没有当前文件，仅重置加载状态
        setLoading(false);
        console.log("没有找到当前文件，重置完成");
      }
    }, 300);
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

  // 关闭窗口
  const handleClose = () => {
    onClose();
  };
  
  // 更新窗口大小状态
  const onResizeStop: ResizeCallback = (_e, _direction, ref, d) => {
    // 更新大小状态
    setWindowSize({
      width: windowSize.width === DEFAULT_WIDTH 
        ? ref.style.width || DEFAULT_WIDTH 
        : typeof windowSize.width === 'number'
          ? (windowSize.width as number) + d.width
          : ref.style.width || DEFAULT_WIDTH,
      height: windowSize.height === DEFAULT_HEIGHT
        ? ref.style.height || DEFAULT_HEIGHT
        : typeof windowSize.height === 'number'
          ? (windowSize.height as number) + d.height
          : ref.style.height || DEFAULT_HEIGHT,
    });
    handleResizeStop();
  };

  return (
    <>
      {contextHolder}
      {visible && (
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
          width={DEFAULT_WIDTH}
          style={{ top: modalBounds.initialTop, pointerEvents: 'none' }}
          styles={modalStyles}
          className="pdf-preview-modal"
          rootClassName="pdf-preview-modal-root"
          destroyOnClose
          modalRender={(modal) => (
            <Draggable
              handle=".ant-modal-header"
              defaultClassName="pdf-preview-draggable"
              disabled={isResizing}
              defaultPosition={{x: 0, y: 0}}
              scale={1}
              grid={[5, 5]}
              bounds={{
                top: -modalBounds.initialTop,
                bottom: windowDimensions.height - modalBounds.initialTop - modalBounds.headerHeight, 
                left: -(windowDimensions.width / 2),
                right: windowDimensions.width / 2
              }}
            >
              <div 
                ref={draggleRef} 
                className="draggable-modal-container"
                style={{
                  position: 'relative',
                  background: 'transparent',
                  pointerEvents: 'none',
                }}
              >
                <Resizable
                  ref={resizableRef}
                  size={{ width: windowSize.width, height: windowSize.height }}
                  minWidth={MIN_WIDTH}
                  minHeight={MIN_HEIGHT}
                  maxWidth={MAX_WIDTH}
                  maxHeight={MAX_HEIGHT}
                  handleStyles={{
                    top: resizeHandleStyles.top,
                    right: resizeHandleStyles.right,
                    bottom: resizeHandleStyles.bottom,
                    left: resizeHandleStyles.left,
                    topRight: resizeHandleStyles.topRight,
                    bottomRight: resizeHandleStyles.bottomRight,
                    bottomLeft: resizeHandleStyles.bottomLeft,
                    topLeft: resizeHandleStyles.topLeft,
                  }}
                  handleClasses={{
                    top: 'hover:bg-blue-200 opacity-0 hover:opacity-30',
                    right: 'hover:bg-blue-200 opacity-0 hover:opacity-30',
                    bottom: 'hover:bg-blue-200 opacity-0 hover:opacity-30',
                    left: 'hover:bg-blue-200 opacity-0 hover:opacity-30',
                    topRight: 'hover:bg-blue-200 opacity-0 hover:opacity-30',
                    bottomRight: 'hover:bg-blue-200 opacity-0 hover:opacity-30',
                    bottomLeft: 'hover:bg-blue-200 opacity-0 hover:opacity-30',
                    topLeft: 'hover:bg-blue-200 opacity-0 hover:opacity-30',
                  }}
                  handleWrapperStyle={{ 
                    opacity: 1, 
                    zIndex: 1000,
                    pointerEvents: 'auto',
                  }}
                  onResizeStart={handleResizeStart}
                  onResize={handleResize}
                  onResizeStop={onResizeStop}
                  style={{
                    position: 'relative',
                    boxShadow: isResizing 
                      ? '0 0 10px 2px rgba(24, 144, 255, 0.5)' 
                      : '0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
                    transition: 'box-shadow 0.2s ease',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    pointerEvents: 'auto',
                    height: '100%',
                  }}
                  enable={{
                    top: true,
                    right: true,
                    bottom: true,
                    left: true,
                    topRight: true,
                    bottomRight: true,
                    bottomLeft: true,
                    topLeft: true,
                  }}
                >
                  {modal}
                </Resizable>
              </div>
            </Draggable>
          )}
        >
          <div 
            ref={containerRef} 
            className="w-full h-full flex flex-col"
            style={{ 
              minHeight: '300px',
              height: windowSize.height === DEFAULT_HEIGHT ? 'calc(100vh - 300px)' : '100%',
              maxHeight: '100%',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              pointerEvents: 'auto',
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
                height: 'calc(100% - 40px)',
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
            <div className="flex justify-between items-center p-2 text-gray-800 bg-white bg-opacity-90" style={{ height: '40px' }}>
              <div className="text-sm">
                {`缩放: ${(scale * 100).toFixed(0)}%`}
              </div>
              <div className="text-xs text-gray-500">
                提示: 拖拽可移动，Ctrl+滚轮可缩放，拖动窗口边缘可调整大小
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default PdfPreview; 
